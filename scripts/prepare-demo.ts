import fixtureData from "../src/data/powell-candidates.fixture.json";
import { collectBrightDataCandidates } from "../src/lib/brightdata/client";
import { writeCandidateCache } from "../src/lib/brightdata/cache";
import { mossHealthCheck } from "../src/lib/moss/client";

try { process.loadEnvFile(".env.local"); } catch {}

const configured = (name: string) => Boolean(process.env[name]);
const powell = { lat: 37.7841, lng: -122.4075, label: "Powell Street Station" };

async function main() {
  console.log("\nGreedyTrip demo readiness\n");
  console.log(`Moss credentials: ${configured("MOSS_PROJECT_ID") && configured("MOSS_PROJECT_KEY") ? "configured" : "missing → fallback ready"}`);
  console.log(`Bright Data key: ${configured("BRIGHTDATA_API_KEY") ? "configured" : "missing → fixture ready"}`);
  console.log(`OpenAI key: ${configured("OPENAI_API_KEY") ? "configured" : "missing → local interpreter ready"}`);
  console.log(`Google Maps embed key: ${configured("NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY") ? "configured" : "missing → deep link ready"}`);

  if (fixtureData.length < 10) throw new Error("Fixture must contain at least ten records");
  console.log(`Fixture validation: ${fixtureData.length} synthetic demo records available`);

  if (configured("BRIGHTDATA_API_KEY") && process.env.GREEDYTRIP_SKIP_LIVE_SEED !== "true") {
    try {
      const candidates = await collectBrightDataCandidates(powell);
      await writeCandidateCache(powell, candidates);
      console.log(`Bright Data seed: cached ${candidates.length} live records`);
    } catch (error) {
      console.log(`Bright Data seed: unavailable, fixture remains active (${error instanceof Error ? error.message : "unknown error"})`);
    }
  } else if (configured("BRIGHTDATA_API_KEY")) {
    console.log("Bright Data seed: skipped for fast startup; run warm-brightdata.cmd before judging");
  }

  if (configured("MOSS_PROJECT_ID") && configured("MOSS_PROJECT_KEY")) {
    const health = await mossHealthCheck();
    console.log(`Moss session check: ${health.ready ? "ready" : "fallback will activate"} — ${health.detail}`);
  } else {
    console.log("Moss session check: skipped; in-memory semantic fallback is ready");
  }

  console.log("\nNext commands:\n  npm run dev\n");
}

main().catch((error) => {
  console.error(`Local demo preparation failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
