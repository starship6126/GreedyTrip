import "server-only";

import { createHash } from "node:crypto";
import { MossClient, type SessionIndex } from "@moss-dev/moss";
import { safeError } from "@/lib/utils";

export const DEFAULT_MOSS_INDEX_NAME = "greedytrip-demo-memory";

export type MossLocalIndexStatus = "ready" | "updated" | "failed";
export type MossRetrievalStatus = "live" | "fallback";
export type MossCloudSyncStatus = "idle" | "submitted" | "completed" | "failed";

export type MossRuntimeMetrics = {
  indexName: string;
  localIndexStatus: MossLocalIndexStatus;
  localDocumentCount: number;
  localUpdateDurationMs: number | null;
  candidateQueryCount: number;
  retrievalDurationMs: number | null;
  retrievalStatus: MossRetrievalStatus;
  cloudSync: {
    status: MossCloudSyncStatus;
    jobId?: string;
    detail: string;
    updatedAt?: string;
  };
};

export type SerializedCloudExecutor = {
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  whenIdle(): Promise<void>;
};

type MossGlobals = typeof globalThis & {
  __greedyTripMossClient?: MossClient;
  __greedyTripMossSession?: Promise<SessionIndex>;
  __greedyTripMossMetrics?: MossRuntimeMetrics;
  __greedyTripMossCloudExecutor?: SerializedCloudExecutor;
  __greedyTripMossCloudTimer?: ReturnType<typeof setTimeout>;
};

const globals = globalThis as MossGlobals;

export function mossIndexName(): string {
  return process.env.MOSS_INDEX_NAME?.trim() || DEFAULT_MOSS_INDEX_NAME;
}

export function hashUserScope(identifier: string): string {
  return createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex").slice(0, 12);
}

function initialMetrics(): MossRuntimeMetrics {
  return {
    indexName: mossIndexName(),
    localIndexStatus: "failed",
    localDocumentCount: 0,
    localUpdateDurationMs: null,
    candidateQueryCount: 0,
    retrievalDurationMs: null,
    retrievalStatus: "fallback",
    cloudSync: { status: "idle", detail: "No cloud checkpoint submitted" },
  };
}

function metrics(): MossRuntimeMetrics {
  globals.__greedyTripMossMetrics ??= initialMetrics();
  globals.__greedyTripMossMetrics.indexName = mossIndexName();
  return globals.__greedyTripMossMetrics;
}

export function getMossRuntimeMetrics(): MossRuntimeMetrics {
  const current = metrics();
  return { ...current, cloudSync: { ...current.cloudSync } };
}

export function recordMossLocalUpdate(input: {
  status: MossLocalIndexStatus;
  docCount: number;
  durationMs: number | null;
}): void {
  Object.assign(metrics(), {
    localIndexStatus: input.status,
    localDocumentCount: input.docCount,
    localUpdateDurationMs: input.durationMs,
  });
}

export function recordMossRetrieval(input: {
  status: MossRetrievalStatus;
  durationMs: number | null;
  queryCount?: number;
}): void {
  const current = metrics();
  current.retrievalStatus = input.status;
  current.retrievalDurationMs = input.durationMs;
  current.candidateQueryCount += input.queryCount ?? 1;
}

export function setMossCloudSyncStatus(
  status: MossCloudSyncStatus,
  detail: string,
  jobId?: string,
): void {
  metrics().cloudSync = {
    status,
    detail,
    ...(jobId ? { jobId } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function createSerializedCloudExecutor(): SerializedCloudExecutor {
  let tail: Promise<void> = Promise.resolve();
  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
    whenIdle(): Promise<void> {
      return tail;
    },
  };
}

function cloudExecutor(): SerializedCloudExecutor {
  globals.__greedyTripMossCloudExecutor ??= createSerializedCloudExecutor();
  return globals.__greedyTripMossCloudExecutor;
}

export function mossConfigured(): boolean {
  return Boolean(process.env.MOSS_PROJECT_ID && process.env.MOSS_PROJECT_KEY);
}

function client(): MossClient {
  if (!process.env.MOSS_PROJECT_ID || !process.env.MOSS_PROJECT_KEY) {
    throw new Error("Moss credentials are not configured");
  }
  globals.__greedyTripMossClient ??= new MossClient(
    process.env.MOSS_PROJECT_ID,
    process.env.MOSS_PROJECT_KEY,
    { cachePath: `${process.cwd()}/.cache/moss` },
  );
  return globals.__greedyTripMossClient;
}

/**
 * The optional argument is retained for compatibility. Every user and reset
 * shares one local SessionIndex; hashed metadata provides isolation.
 */
export async function getMossSession(_userId?: string): Promise<SessionIndex> {
  void _userId;
  if (globals.__greedyTripMossSession) return globals.__greedyTripMossSession;
  const pending = client().session(mossIndexName());
  globals.__greedyTripMossSession = pending;
  try {
    const session = await pending;
    recordMossLocalUpdate({ status: "ready", docCount: session.docCount, durationMs: null });
    return session;
  } catch (error) {
    globals.__greedyTripMossSession = undefined;
    recordMossLocalUpdate({ status: "failed", docCount: 0, durationMs: null });
    throw error;
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cloudJobCompleted(status: string): boolean {
  return status.toLowerCase() === "completed";
}

function cloudJobFailed(status: string): boolean {
  return status.toLowerCase() === "failed";
}

async function runCloudCheckpoint(): Promise<void> {
  try {
    const session = await getMossSession();
    const pushed = await session.pushIndex();
    setMossCloudSyncStatus("submitted", "Cloud checkpoint submitted; completion is not yet verified", pushed.jobId);

    const pollMs = positiveInteger(process.env.MOSS_SYNC_POLL_MS, 1_000);
    const maxPolls = positiveInteger(process.env.MOSS_SYNC_MAX_POLLS, 30);
    for (let attempt = 0; attempt < maxPolls; attempt += 1) {
      if (attempt > 0 || pollMs > 0) await new Promise((resolve) => setTimeout(resolve, pollMs));
      const job = await client().getJobStatus(pushed.jobId);
      if (cloudJobCompleted(job.status)) {
        setMossCloudSyncStatus("completed", "Cloud checkpoint completion verified", pushed.jobId);
        return;
      }
      if (cloudJobFailed(job.status)) {
        setMossCloudSyncStatus(
          "failed",
          safeError(job.error ? new Error(job.error) : undefined, "Cloud checkpoint failed"),
          pushed.jobId,
        );
        return;
      }
      setMossCloudSyncStatus("submitted", `Cloud checkpoint ${job.status}; completion pending`, pushed.jobId);
    }
  } catch (error) {
    setMossCloudSyncStatus("failed", safeError(error, "Cloud checkpoint failed"));
  }
}

/**
 * Schedules, but never awaits, cloud persistence. A short debounce coalesces
 * rapid interview writes and the serialized executor prevents overlapping
 * pushIndex jobs.
 */
export function scheduleMossCloudCheckpoint(debounceMs = 250): boolean {
  if (!mossConfigured() || process.env.GREEDYTRIP_PERSIST_MEMORY === "false") return false;
  if (globals.__greedyTripMossCloudTimer) clearTimeout(globals.__greedyTripMossCloudTimer);
  setMossCloudSyncStatus("idle", "Cloud checkpoint scheduled after local reranking");
  globals.__greedyTripMossCloudTimer = setTimeout(() => {
    globals.__greedyTripMossCloudTimer = undefined;
    void cloudExecutor().enqueue(runCloudCheckpoint);
  }, Math.max(0, debounceMs));
  return true;
}

export async function mossHealthCheck(): Promise<{ ready: boolean; detail: string }> {
  if (!mossConfigured()) return { ready: false, detail: "Credentials not configured" };
  try {
    const session = await getMossSession();
    return {
      ready: true,
      detail: `Fixed local session ${session.name} initialized with ${session.docCount} documents and no health-check write`,
    };
  } catch (error) {
    return { ready: false, detail: safeError(error, "Moss initialization failed") };
  }
}
