import { haversineMeters } from "@/lib/geo";
import type { Candidate, GeoPoint } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

const PRIORITY_FRONTIER_RADIUS_METERS = 800;

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function booleanValue(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && /^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  }
  return null;
}

function canonicalSourceKeyword(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/art|gallery/.test(normalized)) return "art gallery";
  if (/restaurant|food|cafe|bakery/.test(normalized)) return "local restaurant";
  if (/technology|tech|science|digital/.test(normalized)) return "technology museum";
  if (/book/.test(normalized)) return "independent bookstore";
  return value.trim();
}

function sourceKeywordValue(item: UnknownRecord, category: string): string {
  const input = record(item.input);
  const discoveryInput = record(item.discovery_input);
  const raw = stringValue(
    item.keyword,
    item.source_keyword,
    item.search_keyword,
    discoveryInput?.keyword,
    discoveryInput?.search_keyword,
    input?.keyword,
    input?.search_keyword,
    typeof item.discovery_input === "string" ? item.discovery_input : undefined,
    typeof item.input === "string" ? item.input : undefined,
    category,
  ) ?? category;
  return canonicalSourceKeyword(raw);
}

function relevantToDiscovery(sourceKeyword: string, category: string): boolean {
  const categoryText = category.toLowerCase();
  if (sourceKeyword === "art gallery") return /\bart\b|gallery|museum/.test(categoryText);
  if (sourceKeyword === "local restaurant") return /restaurant|cafe|food|bakery|pub|bar|diner/.test(categoryText);
  if (sourceKeyword === "technology museum") return /technology|\btech\b|science|digital|computer|innovation|interactive/.test(categoryText);
  if (sourceKeyword === "independent bookstore") return /book|library/.test(categoryText);
  return true;
}

function photoValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (typeof item === "string") return [item];
      const itemRecord = record(item);
      const url = itemRecord && stringValue(itemRecord.url, itemRecord.photo_url, itemRecord.image);
      return url ? [url] : [];
    })
    .filter((url) => /^https?:\/\//i.test(url))
    .slice(0, 3);
}

function inferTags(sourceKeyword: string, category: string, reviewCount?: number): string[] {
  const source = sourceKeyword.toLowerCase();
  const categoryText = category.toLowerCase();
  const tags = new Set<string>();
  if (/\bart\b|gallery/.test(categoryText) || (/museum/.test(categoryText) && /\bart\b|gallery/.test(source))) {
    tags.add("art");
  }
  if (/restaurant|cafe|food|bakery|pub/.test(categoryText)) tags.add("food");
  if (/tech|technology|science|digital|audiovisual/.test(categoryText)) tags.add("technology");
  if (/book/.test(categoryText) && /independent|book/.test(source)) tags.add("independent");
  if (reviewCount !== undefined && reviewCount > 5000) {
    tags.add("highly-visited");
    tags.add("tourist-oriented-heuristic");
  }
  if (reviewCount !== undefined && reviewCount < 250) tags.add("lesser-known");
  return [...tags];
}

export function normalizeBrightDataRecords(
  values: unknown,
  origin: GeoPoint,
  fetchedAt = new Date().toISOString(),
): Candidate[] {
  const rows = Array.isArray(values)
    ? values
    : Array.isArray(record(values)?.data)
      ? (record(values)?.data as unknown[])
      : [];
  const seen = new Set<string>();
  const normalized: Candidate[] = [];

  for (const row of rows) {
    const item = record(row);
    if (!item) continue;
    const location = record(item.location) ?? record(item.coordinates) ?? record(item.geometry);
    const nested = record(location?.location);
    const lat = numberValue(item.latitude, item.lat, location?.lat, location?.latitude, nested?.lat);
    const lng = numberValue(item.longitude, item.lng, item.lon, item.long, location?.lng, location?.lon, location?.long, location?.longitude, nested?.lng, nested?.lon);
    const name = stringValue(item.name, item.title, item.place_name);
    if (!name || lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (haversineMeters(origin, { lat, lng }) > 2_100) continue;

    const status = stringValue(item.status, item.business_status, item.state)?.toLowerCase();
    if (status && /(permanently[_ -]?closed|closed permanently)/.test(status)) continue;
    if (booleanValue(item.permanently_closed) === true) continue;
    const category = stringValue(item.category, item.type, item.main_category, item.subtype) ?? "Public place";
    const sourceKeyword = sourceKeywordValue(item, category);
    if (!relevantToDiscovery(sourceKeyword, category)) continue;
    const placeId = stringValue(item.place_id, item.placeId, item.google_id, item.cid);
    const dedupeKey = placeId
      ? `place:${placeId}`
      : `geo:${name.toLowerCase().replace(/\W/g, "")}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const rating = numberValue(item.rating, item.stars, item.review_rating);
    const reviewCount = numberValue(item.reviews_count, item.review_count, item.reviews, item.user_ratings_total);
    const priceLevel = numberValue(item.price_level, item.priceLevel);
    const temporarilyClosed = booleanValue(item.temporarily_closed);
    const openNow = temporarilyClosed === true ? false : booleanValue(item.is_open, item.open_now, item.isOpenNow);
    const website = stringValue(item.website, item.site);
    const mapsUrl = stringValue(item.url, item.google_maps_url, item.maps_url);
    normalized.push({
      id: placeId ? `bd-${placeId}` : `bd-${dedupeKey.replace(/[^a-z0-9-]/g, "-")}`,
      ...(placeId ? { placeId } : {}),
      name,
      category,
      sourceKeyword,
      ...(stringValue(item.address, item.full_address, item.formatted_address) ? { address: stringValue(item.address, item.full_address, item.formatted_address) } : {}),
      lat,
      lng,
      ...(rating !== undefined && rating >= 0 && rating <= 5 ? { rating } : {}),
      ...(reviewCount !== undefined && reviewCount >= 0 ? { reviewCount } : {}),
      ...(priceLevel !== undefined && priceLevel >= 0 && priceLevel <= 4 ? { priceLevel } : {}),
      ...(website && /^https?:\/\//i.test(website) ? { website } : {}),
      ...(mapsUrl && /^https?:\/\//i.test(mapsUrl) ? { googleMapsUrl: mapsUrl } : {}),
      photoUrls: [...new Set([
        ...(stringValue(item.main_image) && /^https?:\/\//i.test(stringValue(item.main_image) ?? "") ? [stringValue(item.main_image) as string] : []),
        ...photoValues(item.photos),
        ...photoValues(item.images),
        ...photoValues(item.photo_urls),
        ...photoValues(item.photos_and_videos),
      ])].slice(0, 3),
      ...(item.opening_hours !== undefined ? { rawOpeningHours: item.opening_hours } : {}),
      isOpenNow: openNow,
      ...(stringValue(item.closes_at, item.closing_time) ? { closesAt: stringValue(item.closes_at, item.closing_time) } : {}),
      tags: inferTags(sourceKeyword, category, reviewCount),
      fetchedAt,
      dataSource: "brightdata-live",
    });
  }

  const grouped = new Map<string, Candidate[]>();
  for (const candidate of normalized) {
    const group = candidate.sourceKeyword.toLowerCase();
    grouped.set(group, [...(grouped.get(group) ?? []), candidate]);
  }
  for (const [group, candidates] of grouped) {
    grouped.set(group, candidates
      .map((candidate, discoveryRank) => ({
        candidate,
        discoveryRank,
        nearby: haversineMeters(origin, candidate) <= PRIORITY_FRONTIER_RADIUS_METERS,
      }))
      .sort((a, b) => Number(b.nearby) - Number(a.nearby) || a.discoveryRank - b.discoveryRank)
      .map(({ candidate }) => candidate));
  }
  const diverse: Candidate[] = [];
  const takeRound = (nearbyOnly: boolean): boolean => {
    let tookCandidate = false;
    for (const items of grouped.values()) {
      const candidate = items[0];
      if (!candidate) continue;
      if (nearbyOnly && haversineMeters(origin, candidate) > PRIORITY_FRONTIER_RADIUS_METERS) continue;
      diverse.push(items.shift() as Candidate);
      tookCandidate = true;
      if (diverse.length === 10) return true;
    }
    return tookCandidate;
  };
  while (diverse.length < 10 && takeRound(true)) {
    // First fill the demo frontier with candidates inside the default 10-minute walk.
  }
  while (diverse.length < 10 && takeRound(false)) {
    // Then backfill from the wider source radius only when the nearby pool is sparse.
  }
  return diverse;
}
