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
});
