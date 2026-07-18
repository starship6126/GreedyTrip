import fixtureData from "../src/data/powell-candidates.fixture.json";
import { collectBrightDataCandidates } from "../src/lib/brightdata/client";
import { writeCandidateCache } from "../src/lib/brightdata/cache";

const powell = { lat: 37.7841, lng: -122.4075, label: "Powell Street Station" };

try { process.loadEnvFile(".env.local"); } catch {}

async function main() {
  if (!process.env.BRIGHTDATA_API_KEY) {
    console.log(`Bright Data: not configured. ${fixtureData.length} clearly labeled fixture records are ready.`);
    return;
  }
  console.log("Bright Data: configured. Collecting Powell Street candidates…");
  try {
    const candidates = await collectBrightDataCandidates(powell);
    await writeCandidateCache(powell, candidates);
    console.log(`Cached ${candidates.length} normalized live records.`);
  } catch (error) {
    console.log(`Live seed unavailable; fixture fallback remains ready. ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

await main();
