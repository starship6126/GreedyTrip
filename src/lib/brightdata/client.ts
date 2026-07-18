import "server-only";

import type { Candidate, GeoPoint } from "@/lib/types";
import { normalizeBrightDataRecords } from "@/lib/brightdata/normalize";

export const SEARCH_KEYWORDS = [
  "art gallery",
  "local restaurant",
  "technology museum",
  "independent bookstore",
] as const;

const API_ROOT = "https://api.brightdata.com/datasets/v3";

async function apiFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Bright Data returned HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectBrightDataCandidates(location: GeoPoint): Promise<Candidate[]> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error("Bright Data credentials are not configured");
  const datasetId = process.env.BRIGHTDATA_GOOGLE_MAPS_DATASET_ID ?? "gd_m8ebnr0q2qlklc02fz";
  const url = new URL(`${API_ROOT}/trigger`);
  url.searchParams.set("dataset_id", datasetId);
  url.searchParams.set("format", "json");
  url.searchParams.set("type", "discover_new");
  url.searchParams.set("discover_by", "location");
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const payload = SEARCH_KEYWORDS.map((keyword) => ({
    country: "US",
    lat: location.lat,
    long: location.lng,
    zoom_level: 14,
    keyword,
  }));
  const triggerResponse = await apiFetch(url.toString(), { method: "POST", headers, body: JSON.stringify(payload) }, 15_000);
  const trigger = (await triggerResponse.json()) as { snapshot_id?: unknown };
  if (typeof trigger.snapshot_id !== "string" || !trigger.snapshot_id) {
    throw new Error("Bright Data did not return a snapshot ID");
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    const progressResponse = await apiFetch(`${API_ROOT}/progress/${encodeURIComponent(trigger.snapshot_id)}`, { headers }, 12_000);
    const progress = (await progressResponse.json()) as { status?: unknown };
    const status = typeof progress.status === "string" ? progress.status.toLowerCase() : "unknown";
    if (status === "failed") throw new Error("Bright Data collection failed");
    if (status === "ready") {
      const snapshotResponse = await apiFetch(
        `${API_ROOT}/snapshot/${encodeURIComponent(trigger.snapshot_id)}?format=json`,
        { headers },
        20_000,
      );
      const rows: unknown = await snapshotResponse.json();
      const candidates = normalizeBrightDataRecords(rows, location);
      if (!candidates.length) throw new Error("Bright Data returned no usable nearby places");
      return candidates;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Bright Data collection timed out after 90 seconds");
}
