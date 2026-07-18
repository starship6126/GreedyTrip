import { NextResponse } from "next/server";
import fixtureData from "@/data/powell-candidates.fixture.json";
import { candidatesRequestSchema, candidateSchema } from "@/lib/schemas";
import { collectBrightDataCandidates, SEARCH_KEYWORDS } from "@/lib/brightdata/client";
import { readCandidateCache, writeCandidateCache } from "@/lib/brightdata/cache";
import { integrationEvent, safeError } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const input = candidatesRequestSchema.parse(await request.json());
    const cache = input.forceRefresh ? null : await readCandidateCache(input.location);
    if (cache) {
      const durationMs = Math.round(performance.now() - startedAt);
      return NextResponse.json({
        candidates: cache.candidates,
        source: "Cached",
        cacheSavedAt: cache.savedAt,
        cacheAgeMinutes: cache.ageMinutes,
        cacheTtlMinutes: cache.ttlMinutes,
        durationMs,
        candidateCount: cache.candidates.length,
        refreshTrigger: input.trigger,
        status: "ready",
        liveRefreshPending: false,
        keywords: SEARCH_KEYWORDS,
        integrationEvents: [integrationEvent("brightdata", "candidate cache lookup", "Cached", `${cache.candidates.length} normalized Bright Data records`, durationMs)],
      });
    }

    if (process.env.BRIGHTDATA_API_KEY) {
      try {
        const candidates = await collectBrightDataCandidates(input.location);
        await writeCandidateCache(input.location, candidates);
        const durationMs = Math.round(performance.now() - startedAt);
        return NextResponse.json({
          candidates,
          source: "Live",
          durationMs,
          candidateCount: candidates.length,
          refreshTrigger: input.trigger,
          status: "ready",
          liveRefreshPending: false,
          keywords: SEARCH_KEYWORDS,
          integrationEvents: [integrationEvent("brightdata", "Google Maps discovery", "Live", `${candidates.length} normalized public-place records`, durationMs)],
        });
      } catch (error) {
        const candidates = fixtureData.map((candidate) => candidateSchema.parse(candidate));
        const durationMs = Math.round(performance.now() - startedAt);
        return NextResponse.json({
          candidates,
          source: "Fixture",
          durationMs,
          candidateCount: candidates.length,
          refreshTrigger: input.trigger,
          status: "fallback",
          liveRefreshPending: false,
          keywords: SEARCH_KEYWORDS,
          error: `Live collection unavailable. ${safeError(error, "Using synthetic demo places.")}`,
          integrationEvents: [integrationEvent("brightdata", "Google Maps discovery", "Fixture", "Live request failed; clearly labeled synthetic demo data is active", durationMs)],
        });
      }
    }

    const candidates = fixtureData.map((candidate) => candidateSchema.parse(candidate));
    const durationMs = Math.round(performance.now() - startedAt);
    return NextResponse.json({
      candidates,
      source: "Fixture",
      durationMs,
      candidateCount: candidates.length,
      refreshTrigger: input.trigger,
      status: "fallback",
      liveRefreshPending: false,
      keywords: SEARCH_KEYWORDS,
      error: "Bright Data key not configured; using synthetic demo places.",
      integrationEvents: [integrationEvent("brightdata", "Google Maps discovery", "Fixture", "Credentials missing; synthetic demo data is active", durationMs)],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid candidate request", detail: safeError(error, "Request validation failed") },
      { status: 400 },
    );
  }
}
