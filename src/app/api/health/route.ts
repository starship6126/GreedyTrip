import { NextResponse } from "next/server";
import fixtureData from "@/data/powell-candidates.fixture.json";
import { hasAnyCache } from "@/lib/brightdata/cache";
import { mossConfigured } from "@/lib/moss/client";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    credentials: {
      moss: mossConfigured(),
      brightdata: Boolean(process.env.BRIGHTDATA_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      googleMapsEmbed: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY),
    },
    readiness: {
      moss: mossConfigured() ? "Live-ready" : "Fallback-ready",
      brightdata: process.env.BRIGHTDATA_API_KEY ? "Live-ready" : "Fixture-ready",
      openai: process.env.OPENAI_API_KEY ? "Live-ready" : "Local interpreter ready",
    },
    fixture: { available: fixtureData.length >= 10, count: fixtureData.length, synthetic: true },
    cache: { available: await hasAnyCache() },
  });
}
