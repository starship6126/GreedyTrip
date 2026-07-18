import "server-only";

import type { DocumentInfo, QueryResultDocumentInfo } from "@moss-dev/moss";
import type { MemoryEvidence, MemoryItem } from "@/lib/types";
import { clamp, tokenize } from "@/lib/utils";
import {
  getMossRuntimeMetrics,
  getMossSession,
  hashUserScope,
  mossConfigured,
  mossIndexName,
  recordMossLocalUpdate,
  recordMossRetrieval,
  scheduleMossCloudCheckpoint,
  type MossCloudSyncStatus,
} from "@/lib/moss/client";

export const MIN_MEMORY_SIMILARITY = 0.12;
export const MAX_TOPIC_CONTRIBUTION = 1.5;

export type ScopedMemoryEvidence = MemoryEvidence & { topic: string };

export type MossMemoryUpdateResult = {
  mode: "Live" | "Fallback";
  docCount: number;
  detail: string;
  indexName: string;
  userScope: string;
  added: number;
  updated: number;
  localUpdateDurationMs: number | null;
  cloudStatus: MossCloudSyncStatus;
};

type MemoryGlobals = typeof globalThis & {
  __greedyTripMemories?: Map<string, Map<string, MemoryItem>>;
};

const globals = globalThis as MemoryGlobals;

function store(): Map<string, Map<string, MemoryItem>> {
  globals.__greedyTripMemories ??= new Map();
  return globals.__greedyTripMemories;
}

function memoryMap(userScope: string): Map<string, MemoryItem> {
  const existing = store().get(userScope);
  if (existing) return existing;
  const created = new Map<string, MemoryItem>();
  store().set(userScope, created);
  return created;
}

function interestKey(text: string): string {
  if (/\bart|gallery|design\b/i.test(text)) return "interest:art";
  if (/\bhidden|gem|independent|local|unusual\b/i.test(text)) return "interest:hidden";
  if (/\bfood|restaurant|cafe|eat\b/i.test(text)) return "interest:food";
  if (/\btech|technology|science|digital\b/i.test(text)) return "interest:technology";
  return "interest:general";
}

export function canonicalPreferenceKey(memory: Pick<MemoryItem, "topic" | "text">): string {
  if (memory.topic === "walking") return "max-walk";
  if (memory.topic === "interest") return interestKey(memory.text);
  return memory.topic;
}

export function canonicalPreferenceId(
  userScope: string,
  memory: Pick<MemoryItem, "topic" | "text">,
): string {
  return `pref:${userScope}:${canonicalPreferenceKey(memory)}`;
}

function canonicalMemoryText(memory: MemoryItem): string {
  if (memory.topic === "touristy" && memory.polarity === -1) {
    return "The user strongly dislikes tourist-oriented attractions and prefers less obvious local discoveries.";
  }
  return memory.text.trim();
}

function safeTripId(userScope: string, tripId?: string): string {
  return tripId?.trim() ? `trip-${hashUserScope(tripId)}` : `trip-${userScope}`;
}

function canonicalMemory(userScope: string, memory: MemoryItem): MemoryItem {
  return {
    ...memory,
    id: canonicalPreferenceId(userScope, memory),
    text: canonicalMemoryText(memory),
  };
}

/** Builds canonical upsert documents whose metadata values are all strings. */
export function buildCanonicalMemoryDocuments(
  userId: string,
  memories: MemoryItem[],
  tripId?: string,
): DocumentInfo[] {
  const userScope = hashUserScope(userId);
  const byId = new Map<string, DocumentInfo>();
  for (const input of memories) {
    const memory = canonicalMemory(userScope, input);
    byId.set(memory.id, {
      id: memory.id,
      text: memory.text,
      metadata: {
        userScope,
        tripId: safeTripId(userScope, tripId),
        topic: canonicalPreferenceKey(memory),
        polarity: String(memory.polarity),
        strength: String(memory.strength),
        kind: memory.kind,
        updatedAt: memory.createdAt,
      },
    });
  }
  return [...byId.values()];
}

export function localMemories(userId: string): MemoryItem[] {
  return [...(store().get(hashUserScope(userId))?.values() ?? [])];
}

export function mossUserScopeFilter(userId: string): {
  field: "userScope";
  condition: { $eq: string };
} {
  return { field: "userScope", condition: { $eq: hashUserScope(userId) } };
}

function configuredSimilarityThreshold(): number {
  const raw = Number(process.env.MIN_MEMORY_SIMILARITY ?? process.env.MOSS_MIN_MEMORY_SIMILARITY);
  return Number.isFinite(raw) ? clamp(raw, 0, 1) : MIN_MEMORY_SIMILARITY;
}

function semanticText(value: string): string {
  let expanded = value.toLowerCase().replace(/-/g, " ");
  if (/tourist|highly visited|visitor recognition|review volume|major downtown|landmark/.test(expanded)) {
    expanded += " popular landmark visitor recognition major downtown high review volume highly visited";
  }
  if (/quiet place/.test(expanded)) expanded += " quiet calm peaceful";
  if (/hidden|lesser known|independent/.test(expanded)) expanded += " local discovery hidden gem independent";
  return expanded;
}

function tokenOverlap(query: string, memory: MemoryItem): number {
  const queryTokens = tokenize(semanticText(query));
  const memoryTokens = tokenize(semanticText(memory.text));
  if (!queryTokens.size || !memoryTokens.size) return 0;
  let intersection = 0;
  for (const token of queryTokens) if (memoryTokens.has(token)) intersection += 1;
  return intersection ? clamp(intersection / Math.sqrt(queryTokens.size * memoryTokens.size), 0, 1) : 0;
}

function popularityRiskApplies(query: string): boolean {
  return /tourist[- ]oriented|highly[- ]visited|visitor recognition|review volume|major downtown|landmark|\b[3-9]\d{3,}\s+reviews\b/i.test(query);
}

function evidenceApplies(topic: string, polarity: -1 | 1, query: string): boolean {
  // Walking distance is already enforced as structured state. Keeping this
  // document in Moss is useful memory, but applying a negative semantic score to
  // every in-range place would double-count the hard constraint.
  if (topic === "max-walk") return false;
  if (topic === "touristy" && polarity === -1) return popularityRiskApplies(query);
  if (topic === "crowding" && polarity === -1) return popularityRiskApplies(query) || /crowd|noisy|packed/i.test(query);
  if (topic === "ambience") return /quiet|calm|lively|social|ambience|atmosphere/i.test(query);
  // Semantic similarity retrieves candidates; these deterministic fact gates
  // prevent a plausible-sounding but false explanation (for example, treating a
  // bookstore as an art match solely because both descriptions mention "places").
  if (topic === "interest:art") return /\bart\b|gallery|museum|design|creative/i.test(query);
  if (topic === "interest:hidden") return /hidden|gem|lesser[- ]known|independent|local discovery|neighborhood|unusual/i.test(query);
  if (topic === "interest:food") return /food|restaurant|cafe|coffee|bakery|eatery|bar\b|pub\b/i.test(query);
  if (topic === "interest:technology") return /tech|technology|science|digital|interactive|innovation/i.test(query);
  return true;
}

function boundedEvidence(input: {
  memoryId: string;
  text: string;
  topic: string;
  similarity: number;
  polarity: -1 | 1;
  strength: 1 | 2 | 3;
}): ScopedMemoryEvidence {
  const similarity = clamp(input.similarity, 0, 1);
  return {
    memoryId: input.memoryId,
    text: input.text,
    topic: input.topic,
    similarity,
    polarity: input.polarity,
    strength: input.strength,
    contribution: clamp(
      similarity * input.polarity * input.strength,
      -MAX_TOPIC_CONTRIBUTION,
      MAX_TOPIC_CONTRIBUTION,
    ),
  };
}

/** Ignores weak matches and lets only the highest-impact document per topic contribute. */
export function selectStrongestEvidenceByTopic(
  evidence: ScopedMemoryEvidence[],
  minimumSimilarity = configuredSimilarityThreshold(),
): ScopedMemoryEvidence[] {
  const strongest = new Map<string, ScopedMemoryEvidence>();
  for (const item of evidence) {
    if (item.similarity < minimumSimilarity) continue;
    const current = strongest.get(item.topic);
    if (
      !current ||
      Math.abs(item.contribution) > Math.abs(current.contribution) ||
      (Math.abs(item.contribution) === Math.abs(current.contribution) && item.similarity > current.similarity)
    ) {
      strongest.set(item.topic, item);
    }
  }
  return [...strongest.values()]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 8);
}

function fallbackEvidence(userId: string, query: string): ScopedMemoryEvidence[] {
  const evidence = localMemories(userId).flatMap((memory) => {
    const topic = canonicalPreferenceKey(memory);
    const similarity = tokenOverlap(query, memory);
    if (!evidenceApplies(topic, memory.polarity, query)) return [];
    return [boundedEvidence({
      memoryId: memory.id,
      text: memory.text,
      topic,
      similarity,
      polarity: memory.polarity,
      strength: memory.strength,
    })];
  });
  return selectStrongestEvidenceByTopic(evidence);
}

function parsedPolarity(value: string | undefined): -1 | 1 {
  return value === "-1" ? -1 : 1;
}

function parsedStrength(value: string | undefined): 1 | 2 | 3 {
  const strength = Number(value);
  return strength === 2 || strength === 3 ? strength : 1;
}

export function evidenceFromQueryDocuments(
  documents: QueryResultDocumentInfo[],
  query: string,
  minimumSimilarity = configuredSimilarityThreshold(),
): ScopedMemoryEvidence[] {
  const evidence = documents.flatMap((document) => {
    const polarity = parsedPolarity(document.metadata?.polarity);
    const topic = document.metadata?.topic ?? "other";
    if (!evidenceApplies(topic, polarity, query)) return [];
    return [boundedEvidence({
      memoryId: document.id,
      text: document.text,
      topic,
      similarity: document.score,
      polarity,
      strength: parsedStrength(document.metadata?.strength),
    })];
  });
  return selectStrongestEvidenceByTopic(evidence, minimumSimilarity);
}

export async function addMemories(
  userId: string,
  memories: MemoryItem[],
  pushToCloud = false,
  tripId?: string,
): Promise<MossMemoryUpdateResult> {
  const userScope = hashUserScope(userId);
  const documents = buildCanonicalMemoryDocuments(userId, memories, tripId);
  const local = memoryMap(userScope);
  for (const memory of memories) {
    const canonical = canonicalMemory(userScope, memory);
    local.set(canonical.id, canonical);
  }

  if (!documents.length) {
    const current = getMossRuntimeMetrics();
    return {
      mode: mossConfigured() && current.localIndexStatus !== "failed" ? "Live" : "Fallback",
      docCount: local.size,
      detail: "No durable memory was needed",
      indexName: mossIndexName(),
      userScope,
      added: 0,
      updated: 0,
      localUpdateDurationMs: null,
      cloudStatus: current.cloudSync.status,
    };
  }
  if (!mossConfigured()) {
    recordMossLocalUpdate({ status: "updated", docCount: local.size, durationMs: null });
    return {
      mode: "Fallback",
      docCount: local.size,
      detail: "Canonical in-memory evidence fallback updated",
      indexName: mossIndexName(),
      userScope,
      added: documents.length,
      updated: 0,
      localUpdateDurationMs: null,
      cloudStatus: getMossRuntimeMetrics().cloudSync.status,
    };
  }

  const startedAt = performance.now();
  try {
    const session = await getMossSession();
    const mutation = await session.addDocs(documents, { upsert: true });
    const durationMs = Math.round(performance.now() - startedAt);
    recordMossLocalUpdate({ status: "updated", docCount: session.docCount, durationMs });
    if (pushToCloud) scheduleMossCloudCheckpoint();
    return {
      mode: "Live",
      docCount: session.docCount,
      detail: `Canonical preferences indexed locally (${mutation.added} added, ${mutation.updated} updated)`,
      indexName: session.name,
      userScope,
      added: mutation.added,
      updated: mutation.updated,
      localUpdateDurationMs: durationMs,
      cloudStatus: getMossRuntimeMetrics().cloudSync.status,
    };
  } catch {
    const durationMs = Math.round(performance.now() - startedAt);
    recordMossLocalUpdate({ status: "failed", docCount: local.size, durationMs });
    return {
      mode: "Fallback",
      docCount: local.size,
      detail: "Moss local indexing failed; canonical in-memory evidence fallback is active",
      indexName: mossIndexName(),
      userScope,
      added: documents.length,
      updated: 0,
      localUpdateDurationMs: durationMs,
      cloudStatus: getMossRuntimeMetrics().cloudSync.status,
    };
  }
}

export async function deleteCanonicalPreference(
  userId: string,
  preferenceKey: string,
  pushToCloud = false,
): Promise<{ mode: "Live" | "Fallback"; deleted: number }> {
  const userScope = hashUserScope(userId);
  const id = `pref:${userScope}:${preferenceKey}`;
  const deletedLocally = memoryMap(userScope).delete(id) ? 1 : 0;
  if (!mossConfigured()) return { mode: "Fallback", deleted: deletedLocally };
  try {
    const session = await getMossSession();
    const deleted = await session.deleteDocs([id]);
    recordMossLocalUpdate({ status: "updated", docCount: session.docCount, durationMs: null });
    if (pushToCloud) scheduleMossCloudCheckpoint();
    return { mode: "Live", deleted };
  } catch {
    return { mode: "Fallback", deleted: deletedLocally };
  }
}

export async function queryMemoryEvidence(
  userId: string,
  query: string,
  _tripId?: string,
): Promise<{
  evidence: MemoryEvidence[];
  mode: "Live" | "Fallback";
  durationMs: number | null;
  queryCount: number;
  threshold: number;
  indexName: string;
  userScope: string;
  docCount: number;
}> {
  void _tripId;
  const userScope = hashUserScope(userId);
  const threshold = configuredSimilarityThreshold();
  if (mossConfigured()) {
    const startedAt = performance.now();
    try {
      const session = await getMossSession();
      if (session.docCount > 0) {
        const result = await session.query(query, {
          topK: 6,
          alpha: 0.9,
          filter: mossUserScopeFilter(userId),
        });
        const durationMs = Math.round(performance.now() - startedAt);
        const evidence = evidenceFromQueryDocuments(result.docs, query, threshold);
        recordMossRetrieval({ status: "live", durationMs, queryCount: 1 });
        return {
          evidence,
          mode: "Live",
          durationMs,
          queryCount: 1,
          threshold,
          indexName: session.name,
          userScope,
          docCount: session.docCount,
        };
      }
    } catch {
      // Honest local fallback below.
    }
  }
  const evidence = fallbackEvidence(userId, query);
  recordMossRetrieval({ status: "fallback", durationMs: null, queryCount: 1 });
  return {
    evidence,
    mode: "Fallback",
    durationMs: null,
    queryCount: 1,
    threshold,
    indexName: mossIndexName(),
    userScope,
    docCount: localMemories(userId).length,
  };
}
