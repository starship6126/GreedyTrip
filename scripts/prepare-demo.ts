import fixtureData from "../src/data/powell-candidates.fixture.json";
import { collectBrightDataCandidates } from "../src/lib/brightdata/client";
import { readCandidateCache, writeCandidateCache } from "../src/lib/brightdata/cache";
import { DEMO_LOCATIONS } from "../src/lib/geo";
import { mossHealthCheck } from "../src/lib/moss/client";
import { interpretTurn } from "../src/lib/agent/interpreter";

try { process.loadEnvFile(".env.local"); } catch {}

const configured = (name: string) => Boolean(process.env[name]);
const powell = { lat: 37.7841, lng: -122.4075, label: "Powell Street Station" };

async function main() {
  console.log("\nGreedyTrip demo readiness\n");
  console.log(`Moss credentials: ${configured("MOSS_PROJECT_ID") && configured("MOSS_PROJECT_KEY") ? "configured" : "missing → fallback ready"}`);
  console.log(`Bright Data key: ${configured("BRIGHTDATA_API_KEY") ? "configured" : "missing → fixture ready"}`);
  console.log(`Gemini key: ${configured("GEMINI_API_KEY") ? "configured → hybrid unknown-utterance fallback ready" : "missing → local interpreter ready"}`);
  console.log(`Google Maps embed key: ${configured("NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY") ? "configured" : "missing → deep link ready"}`);

  if (fixtureData.length < 10) throw new Error("Fixture must contain at least ten records");
  console.log(`Fixture validation: ${fixtureData.length} synthetic demo records available`);

  if (configured("BRIGHTDATA_API_KEY") && process.env.GREEDYTRIP_SKIP_LIVE_SEED !== "true") {
    try {
      const candidates = await collectBrightDataCandidates(powell);
      await Promise.all(DEMO_LOCATIONS.map((location) => writeCandidateCache(location, candidates)));
      console.log(`Bright Data seed: cached ${candidates.length} live records for all ${DEMO_LOCATIONS.length} demo locations`);
    } catch (error) {
      console.log(`Bright Data seed: unavailable, fixture remains active (${error instanceof Error ? error.message : "unknown error"})`);
    }
  } else if (configured("BRIGHTDATA_API_KEY")) {
    const caches = await Promise.all(DEMO_LOCATIONS.map((location) => readCandidateCache(location)));
    const readyCount = caches.filter((cache) => cache !== null).length;
    console.log(readyCount === DEMO_LOCATIONS.length
      ? `Bright Data cache: ready for all ${readyCount} demo locations; live seed skipped for fast startup`
      : `Bright Data cache: ${readyCount}/${DEMO_LOCATIONS.length} demo locations ready; run warm-brightdata.cmd before judging`);
  }

  if (configured("MOSS_PROJECT_ID") && configured("MOSS_PROJECT_KEY")) {
    const health = await mossHealthCheck();
    console.log(`Moss session check: ${health.ready ? "ready" : "fallback will activate"} — ${health.detail}`);
  } else {
    console.log("Moss session check: skipped; in-memory semantic fallback is ready");
  }

  if (configured("GEMINI_API_KEY")) {
    const check = await interpretTurn("I prefer small independent places with an atmospheric feel.");
    console.log(check.source === "Gemini Live"
      ? `Gemini interpreter check: ready — ${process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite"} responded in ${check.durationMs} ms`
      : "Gemini interpreter check: unavailable — local fallback remains ready; verify the key, model access, and free-tier quota");
  }

  console.log("\nNext command (Windows):\n  start-demo.cmd\n");
}

main().catch((error) => {
  console.error(`Local demo preparation failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
