import { normalizeBrightDataRecords } from "../src/lib/brightdata/normalize";
import { writeCandidateCache } from "../src/lib/brightdata/cache";
import { DEMO_LOCATIONS } from "../src/lib/geo";

try { process.loadEnvFile(".env.local"); } catch {}

async function main() {
  const snapshotId = process.argv[2];
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!snapshotId) throw new Error("Pass a ready Bright Data snapshot ID");
  if (!apiKey) throw new Error("Bright Data API key is not configured in .env.local");

  const response = await fetch(
    `https://api.brightdata.com/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!response.ok) throw new Error(`Snapshot download returned HTTP ${response.status}`);
  const rows: unknown = await response.json();
  let cachedLocations = 0;
  for (const location of DEMO_LOCATIONS) {
    const candidates = normalizeBrightDataRecords(rows, location);
    if (!candidates.length) continue;
    await writeCandidateCache(location, candidates);
    cachedLocations += 1;
    console.log(`Cached ${candidates.length} normalized records for ${location.label}.`);
  }
  if (cachedLocations !== DEMO_LOCATIONS.length) {
    throw new Error(`Snapshot covered ${cachedLocations} of ${DEMO_LOCATIONS.length} demo locations`);
  }
  console.log(`Bright Data snapshot cache ready for all ${cachedLocations} demo locations (${snapshotId}).`);
}

main().catch((error) => {
  console.error(`Snapshot cache failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
