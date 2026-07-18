import { collectBrightDataCandidates } from "../src/lib/brightdata/client";
import { writeCandidateCache } from "../src/lib/brightdata/cache";
import { DEMO_LOCATIONS } from "../src/lib/geo";

const powell = { lat: 37.7841, lng: -122.4075, label: "Powell Street Station" };

try { process.loadEnvFile(".env.local"); } catch {}

async function main() {
  if (!process.env.BRIGHTDATA_API_KEY) {
    throw new Error("Bright Data API key is not configured in .env.local");
  }
  console.log("Bright Data: configured. Collecting Powell Street candidates…");
  const configuredTimeout = Number(process.env.GREEDYTRIP_BRIGHTDATA_WARMUP_TIMEOUT_MS ?? 900_000);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.trunc(configuredTimeout)
    : 900_000;
  const startedAt = Date.now();
  console.log(`Warmup limit: ${Math.ceil(timeoutMs / 1_000)} seconds. Progress prints every 15 seconds.`);
  const progressTimer = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1_000);
    console.log(`Bright Data: still collecting (${elapsedSeconds}s elapsed; ${Math.ceil(timeoutMs / 1_000)}s limit)…`);
  }, 15_000);
  progressTimer.unref();

  try {
    const candidates = await collectBrightDataCandidates(powell, { timeoutMs });
    await Promise.all(DEMO_LOCATIONS.map((location) => writeCandidateCache(location, candidates)));
    console.log(`Cached ${candidates.length} normalized live records for all ${DEMO_LOCATIONS.length} demo locations.`);
  } catch (error) {
    throw new Error(`Live seed unavailable: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    clearInterval(progressTimer);
  }
}

main().catch((error) => {
  console.error(`Bright Data warmup failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
