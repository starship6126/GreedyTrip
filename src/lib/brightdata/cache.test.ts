import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DEFAULT_BRIGHTDATA_CACHE_TTL_MINUTES, brightDataCacheTtlMinutes, cacheKey } from "@/lib/brightdata/cache";

describe("Bright Data cache policy", () => {
  it("keeps a prepared judge cache valid for one day by default", () => {
    expect(DEFAULT_BRIGHTDATA_CACHE_TTL_MINUTES).toBe(1_440);
    expect(brightDataCacheTtlMinutes(undefined)).toBe(1_440);
  });

  it("rejects invalid TTL configuration", () => {
    expect(brightDataCacheTtlMinutes("0")).toBe(1_440);
    expect(brightDataCacheTtlMinutes("not-a-number")).toBe(1_440);
    expect(brightDataCacheTtlMinutes("30")).toBe(30);
  });

  it("uses a stable coarse location key for the prepared Powell cache", () => {
    expect(cacheKey({ lat: 37.7841, lng: -122.4075, label: "Powell" })).toBe("37.78_m122.41");
  });
});
