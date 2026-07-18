import { describe, expect, it } from "vitest";
import { normalizeBrightDataRecords } from "@/lib/brightdata/normalize";

const origin = { lat: 37.7841, lng: -122.4075, label: "Powell" };

describe("Bright Data normalization", () => {
  it("handles missing optional fields without inventing values", () => {
    const [result] = normalizeBrightDataRecords([{ title: "Sparse Place", latitude: 37.784, longitude: -122.407 }], origin);
    expect(result.name).toBe("Sparse Place");
    expect(result.isOpenNow).toBeNull();
    expect(result.rating).toBeUndefined();
    expect(result.photoUrls).toEqual([]);
  });

  it("removes duplicate place IDs", () => {
    const results = normalizeBrightDataRecords([
      { place_id: "same", name: "One", lat: 37.784, lng: -122.407 },
      { place_id: "same", name: "One duplicate", lat: 37.7841, lng: -122.4071 },
    ], origin);
    expect(results).toHaveLength(1);
  });

  it("normalizes the live Google Maps lon and main_image fields", () => {
    const [result] = normalizeBrightDataRecords([{
      place_id: "live-place",
      name: "Live Gallery",
      category: "Art gallery",
      lat: 37.784,
      lon: -122.407,
      main_image: "https://example.com/gallery.jpg",
      permanently_closed: false,
      temporarily_closed: false,
    }], origin);
    expect(result.lng).toBe(-122.407);
    expect(result.photoUrls).toEqual(["https://example.com/gallery.jpg"]);
  });

  it("extracts the discovery keyword from the real Bright Data row shape", () => {
    const [result] = normalizeBrightDataRecords([{
      place_id: "live-discovery-place",
      name: "Live Bookshop",
      category: "Book store",
      lat: 37.784,
      lon: -122.407,
      input: { url: "https://example.com/maps-search" },
      discovery_input: {
        country: "US",
        lat: 37.7841,
        long: -122.4075,
        zoom_level: 14,
        keyword: "independent bookstore",
      },
    }], origin);
    expect(result.sourceKeyword).toBe("independent bookstore");
    expect(result.tags).toContain("independent");
  });

  it("drops unrelated discovery results instead of mislabeling them", () => {
    const results = normalizeBrightDataRecords([
      {
        place_id: "church-result",
        name: "Nearby Church",
        category: "Catholic church",
        lat: 37.784,
        lon: -122.407,
        discovery_input: { keyword: "technology museum" },
      },
      {
        place_id: "department-result",
        name: "Department Store",
        category: "Department store",
        lat: 37.7841,
        lon: -122.4071,
        discovery_input: { keyword: "independent bookstore" },
      },
    ], origin);
    expect(results).toEqual([]);
  });

  it("does not let an irrelevant duplicate hide a later relevant discovery row", () => {
    const results = normalizeBrightDataRecords([
      {
        place_id: "shared-place",
        name: "Shared Place",
        category: "Catholic church",
        lat: 37.784,
        lon: -122.407,
        discovery_input: { keyword: "technology museum" },
      },
      {
        place_id: "shared-place",
        name: "Shared Place Gallery",
        category: "Art gallery",
        lat: 37.784,
        lon: -122.407,
        discovery_input: { keyword: "art gallery" },
      },
    ], origin);
    expect(results.map((candidate) => candidate.name)).toEqual(["Shared Place Gallery"]);
  });

  it("round-robins the four discovery groups instead of returning one category only", () => {
    const keywords = [
      "art gallery",
      "local restaurant",
      "technology museum",
      "independent bookstore",
    ];
    const rows = keywords.flatMap((keyword, keywordIndex) =>
      Array.from({ length: 4 }, (_, index) => ({
        place_id: `${keywordIndex}-${index}`,
        name: `${keyword} ${index}`,
        category: keyword,
        lat: 37.784 + index * 0.0001,
        lon: -122.407 - keywordIndex * 0.0001,
        discovery_input: { keyword },
      })),
    );
    const results = normalizeBrightDataRecords(rows, origin);
    expect(results).toHaveLength(10);
    expect(new Set(results.map((candidate) => candidate.sourceKeyword))).toEqual(new Set(keywords));
    for (const keyword of keywords) {
      expect(results.filter((candidate) => candidate.sourceKeyword === keyword).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("prioritizes walkable rows before farther rows within each discovery group", () => {
    const results = normalizeBrightDataRecords([
      {
        place_id: "far-art",
        name: "Far Art",
        category: "Art gallery",
        lat: 37.794,
        lon: -122.407,
        discovery_input: { keyword: "art gallery" },
      },
      {
        place_id: "near-art",
        name: "Near Art",
        category: "Art gallery",
        lat: 37.7842,
        lon: -122.407,
        discovery_input: { keyword: "art gallery" },
      },
    ], origin);
    expect(results.map((candidate) => candidate.name)).toEqual(["Near Art", "Far Art"]);
  });

  it("fills from other nearby groups before backfilling a farther candidate", () => {
    const rows = [
      {
        place_id: "near-art",
        name: "Near Art",
        category: "Art gallery",
        lat: 37.7842,
        lon: -122.407,
        discovery_input: { keyword: "art gallery" },
      },
      {
        place_id: "far-art",
        name: "Far Art",
        category: "Art gallery",
        lat: 37.794,
        lon: -122.407,
        discovery_input: { keyword: "art gallery" },
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        place_id: `near-food-${index}`,
        name: `Near Food ${index}`,
        category: "Local restaurant",
        lat: 37.7842 + index * 0.0001,
        lon: -122.4071,
        discovery_input: { keyword: "local restaurant" },
      })),
    ];
    const results = normalizeBrightDataRecords(rows, origin);
    expect(results).toHaveLength(10);
    expect(results.map((candidate) => candidate.name)).not.toContain("Far Art");
  });
});
