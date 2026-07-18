import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Candidate, GeoPoint } from "@/lib/types";
import { candidateSchema } from "@/lib/schemas";

type CachePayload = { savedAt: string; candidates: Candidate[] };

function cacheDirectory(): string {
  return path.join(process.cwd(), ".cache", "brightdata");
}

export function cacheKey(location: GeoPoint): string {
  return `${location.lat.toFixed(2)}_${location.lng.toFixed(2)}`.replace(/-/g, "m");
}

export async function readCandidateCache(location: GeoPoint): Promise<CachePayload | null> {
  try {
    const value = JSON.parse(await readFile(path.join(cacheDirectory(), `${cacheKey(location)}.json`), "utf8")) as CachePayload;
    const ttlMinutes = Number(process.env.GREEDYTRIP_BRIGHTDATA_CACHE_TTL_MINUTES ?? 30);
    const age = Date.now() - new Date(value.savedAt).getTime();
    if (!Number.isFinite(age) || age > ttlMinutes * 60_000) return null;
    const candidates = value.candidates.map((candidate) => candidateSchema.parse({ ...candidate, dataSource: "brightdata-cache" }));
    return { ...value, candidates };
  } catch {
    return null;
  }
}

export async function writeCandidateCache(location: GeoPoint, candidates: Candidate[]): Promise<void> {
  await mkdir(cacheDirectory(), { recursive: true });
  const payload: CachePayload = { savedAt: new Date().toISOString(), candidates };
  await writeFile(path.join(cacheDirectory(), `${cacheKey(location)}.json`), JSON.stringify(payload, null, 2), "utf8");
}

export async function hasAnyCache(): Promise<boolean> {
  try {
    const { readdir } = await import("node:fs/promises");
    return (await readdir(cacheDirectory())).some((name) => name.endsWith(".json"));
  } catch {
    return false;
  }
}
