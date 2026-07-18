import { haversineMeters } from "@/lib/geo";
import type { Candidate, GeoPoint } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

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
  const text = `${sourceKeyword} ${category}`.toLowerCase();
  const tags = new Set<string>();
  if (/art|gallery|museum/.test(text)) tags.add("art");
  if (/restaurant|cafe|food|bakery/.test(text)) tags.add("food");
  if (/tech|science|digital/.test(text)) tags.add("technology");
  if (/book/.test(text)) tags.add("independent");
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
    const lng = numberValue(item.longitude, item.lng, item.long, location?.lng, location?.long, location?.longitude, nested?.lng);
    const name = stringValue(item.name, item.title, item.place_name);
    if (!name || lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (haversineMeters(origin, { lat, lng }) > 2_100) continue;

    const status = stringValue(item.status, item.business_status, item.state)?.toLowerCase();
    if (status && /(permanently[_ -]?closed|closed permanently)/.test(status)) continue;
    const placeId = stringValue(item.place_id, item.placeId, item.google_id, item.cid);
    const dedupeKey = placeId
      ? `place:${placeId}`
      : `geo:${name.toLowerCase().replace(/\W/g, "")}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const category = stringValue(item.category, item.type, item.main_category, item.subtype) ?? "Public place";
    const sourceKeyword = stringValue(item.keyword, item.source_keyword, item.search_keyword) ?? category;
    const rating = numberValue(item.rating, item.stars, item.review_rating);
    const reviewCount = numberValue(item.reviews_count, item.review_count, item.reviews, item.user_ratings_total);
    const priceLevel = numberValue(item.price_level, item.priceLevel);
    const openNow = booleanValue(item.is_open, item.open_now, item.isOpenNow);
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
      photoUrls: [
        ...photoValues(item.photos),
        ...photoValues(item.images),
        ...photoValues(item.photo_urls),
      ].slice(0, 3),
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
    const group = candidate.tags.includes("food") ? "food" : candidate.sourceKeyword.toLowerCase();
    grouped.set(group, [...(grouped.get(group) ?? []), candidate]);
  }
  const diverse: Candidate[] = [];
  while (diverse.length < 10 && [...grouped.values()].some((items) => items.length)) {
    for (const items of grouped.values()) {
      const candidate = items.shift();
      if (candidate) diverse.push(candidate);
      if (diverse.length === 10) break;
    }
  }
  return diverse;
}
