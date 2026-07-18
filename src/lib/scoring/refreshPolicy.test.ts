import { describe, expect, it } from "vitest";
import { shouldRefreshCandidates, shouldRerank } from "@/lib/scoring/refreshPolicy";

const base = {
  movementMeters: 0,
  hasValidCache: false,
  untriedNearbyCount: 6,
  currentUnavailable: false,
  hasFoodCandidates: true,
  mealWindowChanged: false,
};

describe("event-driven refresh policy", () => {
  it("does not refresh for movement below 300 meters", () => {
    expect(shouldRefreshCandidates({ ...base, trigger: "MOVED_300M", movementMeters: 299 })).toBe(false);
  });

  it("refreshes above 300 meters when the new cache area is missing", () => {
    expect(shouldRefreshCandidates({ ...base, trigger: "MOVED_300M", movementMeters: 301 })).toBe(true);
    expect(shouldRefreshCandidates({ ...base, trigger: "MOVED_300M", movementMeters: 301, hasValidCache: true })).toBe(false);
  });

  it("always reranks after rejection", () => {
    expect(shouldRerank("REJECTED")).toBe(true);
  });

  it("does not call Bright Data for rejection while the pool is healthy", () => {
    expect(shouldRefreshCandidates({ ...base, trigger: "REJECTED", untriedNearbyCount: 6 })).toBe(false);
    expect(shouldRefreshCandidates({ ...base, trigger: "REJECTED", untriedNearbyCount: 2 })).toBe(true);
  });
});
