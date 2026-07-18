import { collectBrightDataCandidates } from "../src/lib/brightdata/client";
import { writeCandidateCache } from "../src/lib/brightdata/cache";

const powell = { lat: 37.7841, lng: -122.4075, label: "Powell Street Station" };

try { process.loadEnvFile(".env.local"); } catch {}

async function main() {
  if (!process.env.BRIGHTDATA_API_KEY) {
    throw new Error("Bright Data API key is not configured in .env.local");
  }
  console.log("Bright Data: configured. Collecting Powell Street candidates…");
  try {
    const timeoutMs = Number(process.env.GREEDYTRIP_BRIGHTDATA_WARMUP_TIMEOUT_MS ?? 900_000);
    const candidates = await collectBrightDataCandidates(powell, { timeoutMs });
    await writeCandidateCache(powell, candidates);
    console.log(`Cached ${candidates.length} normalized live records.`);
  } catch (error) {
    throw new Error(`Live seed unavailable: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

main().catch((error) => {
  console.error(`Bright Data warmup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
