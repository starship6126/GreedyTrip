import { NextResponse } from "next/server";
import fixtureData from "@/data/powell-candidates.fixture.json";
import { readCandidateCache } from "@/lib/brightdata/cache";
import { DEMO_LOCATIONS } from "@/lib/geo";
import { mossConfigured, mossHealthCheck } from "@/lib/moss/client";

export const runtime = "nodejs";

export async function GET() {
  const [mossHealth, ...demoCaches] = await Promise.all([
    mossConfigured()
      ? mossHealthCheck()
      : Promise.resolve({ ready: false, detail: "Moss credentials are not configured" }),
    ...DEMO_LOCATIONS.map((location) => readCandidateCache(location)),
  ]);
  const availableCaches = demoCaches.filter((cache) => cache !== null);
  const originCache = demoCaches[0];
  const allDemoLocationsReady = availableCaches.length === DEMO_LOCATIONS.length;
  return NextResponse.json({
    credentials: {
      moss: mossConfigured(),
      brightdata: Boolean(process.env.BRIGHTDATA_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      googleMapsEmbed: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY),
    },
    readiness: {
      moss: mossHealth.ready ? "Live-ready" : "Fallback-ready",
      mossDetail: mossHealth.detail,
      brightdata: allDemoLocationsReady ? "Cached-live-data-ready" : process.env.BRIGHTDATA_API_KEY ? "Live-collection-ready" : "Fixture-ready",
      gemini: process.env.GEMINI_API_KEY ? "Hybrid fallback ready" : "Local interpreter ready",
    },
    fixture: { available: fixtureData.length >= 10, count: fixtureData.length, synthetic: true },
    cache: originCache
      ? {
          available: true,
          allDemoLocationsReady,
          readyLocationCount: availableCaches.length,
          demoLocationCount: DEMO_LOCATIONS.length,
          source: "Bright Data",
          savedAt: originCache.savedAt,
          ageMinutes: originCache.ageMinutes,
          ttlMinutes: originCache.ttlMinutes,
          candidateCount: originCache.candidates.length,
        }
      : {
          available: false,
          allDemoLocationsReady: false,
          readyLocationCount: availableCaches.length,
          demoLocationCount: DEMO_LOCATIONS.length,
        },
  });
}
