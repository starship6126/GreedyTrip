import { describe, expect, it } from "vitest";
import { DEMO_LOCATIONS, haversineMeters, walkingMinutes } from "@/lib/geo";

describe("geo", () => {
  it("calculates haversine distance between demo points", () => {
    const distance = haversineMeters(DEMO_LOCATIONS[0], DEMO_LOCATIONS[1]);
    expect(distance).toBeGreaterThan(400);
    expect(distance).toBeLessThan(500);
  });

  it("converts distance to walking minutes at 80m/minute", () => {
    expect(walkingMinutes(0)).toBe(1);
    expect(walkingMinutes(160)).toBe(2);
    expect(walkingMinutes(161)).toBe(3);
  });
});
