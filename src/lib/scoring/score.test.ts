import { describe, expect, it } from "vitest";
import { hardFilterCandidates, scoreCandidate } from "@/lib/scoring/score";
import type { Candidate, GeoPoint, MemoryEvidence, UserProfile } from "@/lib/types";

const location: GeoPoint = { lat: 37.7841, lng: -122.4075, label: "Powell" };
const profile: UserProfile = { ambience: "quiet", maxWalkMinutes: 10, interests: ["art", "hidden"], priority: "uniqueness", interviewComplete: true };

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "base",
    name: "Base Place",
    category: "Gallery",
    sourceKeyword: "art gallery",
    lat: 37.7845,
    lng: -122.4069,
    photoUrls: [],
    isOpenNow: null,
    tags: ["art"],
    fetchedAt: new Date().toISOString(),
    dataSource: "fixture",
    ...overrides,
  };
}

describe("explainable scoring", () => {
  it("hard filters known-closed, excluded, and far candidates", () => {
    const values = [
      candidate({ id: "open" }),
      candidate({ id: "closed", isOpenNow: false }),
      candidate({ id: "excluded" }),
      candidate({ id: "far", lat: 37.82 }),
    ];
    expect(hardFilterCandidates(values, location, 10, new Set(["excluded"])).map((item) => item.id)).toEqual(["open"]);
  });

  it("keeps unknown opening hours neutral", () => {
    const unknown = scoreCandidate({ candidate: candidate({ isOpenNow: null }), location, profile, evidence: [], currentTime: new Date("2026-07-18T15:00:00-07:00") });
    const knownOpen = scoreCandidate({ candidate: candidate({ isOpenNow: true }), location, profile, evidence: [], currentTime: new Date("2026-07-18T15:00:00-07:00") });
    expect(unknown.breakdown.timeRelevance).toBe(7.5);
    expect(knownOpen.breakdown.timeRelevance).toBeGreaterThan(unknown.breakdown.timeRelevance);
  });

  it("clamps every score component to its documented range", () => {
    const extremeEvidence: MemoryEvidence[] = [{ memoryId: "m", text: "match", similarity: 9, polarity: 1, strength: 3, contribution: 999 }];
    const result = scoreCandidate({ candidate: candidate({ reviewCount: 50_000, rating: 5, priceLevel: 4, tags: ["highly-visited"] }), location, profile: { ...profile, priority: "budget" }, evidence: extremeEvidence, currentTime: new Date() });
    expect(result.breakdown.preferenceMatch).toBeLessThanOrEqual(30);
    expect(result.breakdown.accessibility).toBeLessThanOrEqual(20);
    expect(result.breakdown.rarity).toBeLessThanOrEqual(15);
    expect(result.breakdown.timeRelevance).toBeLessThanOrEqual(15);
    expect(result.breakdown.quality).toBeLessThanOrEqual(10);
    expect(result.breakdown.costPenalty).toBeLessThanOrEqual(5);
    expect(result.breakdown.waitRiskPenalty).toBeLessThanOrEqual(10);
    expect(result.breakdown.total).toBeGreaterThanOrEqual(0);
  });

  it("strong touristy feedback lowers a highly visited candidate", () => {
    const popular = candidate({ id: "popular", reviewCount: 15_000, rating: 4.8, tags: ["art", "highly-visited", "tourist-oriented-heuristic"] });
    const negative: MemoryEvidence[] = [{ memoryId: "touristy", text: "The user strongly dislikes tourist-oriented attractions.", similarity: 0.9, polarity: -1, strength: 3, contribution: -2.7 }];
    const before = scoreCandidate({ candidate: popular, location, profile, evidence: [], currentTime: new Date() });
    const after = scoreCandidate({ candidate: popular, location, profile, evidence: negative, currentTime: new Date() });
    expect(after.score).toBeLessThan(before.score);
  });

  it("a lesser-known local option beats a tourist-oriented option after feedback", () => {
    const negative: MemoryEvidence[] = [{ memoryId: "touristy", text: "The user strongly dislikes tourist-oriented attractions.", similarity: 0.9, polarity: -1, strength: 3, contribution: -2.7 }];
    const popular = scoreCandidate({ candidate: candidate({ id: "popular", reviewCount: 15_000, rating: 4.8, tags: ["art", "highly-visited", "tourist-oriented-heuristic"] }), location, profile, evidence: negative, currentTime: new Date() });
    const local = scoreCandidate({ candidate: candidate({ id: "local", reviewCount: 90, rating: 4.6, tags: ["art", "local", "lesser-known", "independent"] }), location, profile, evidence: [], currentTime: new Date() });
    expect(local.score).toBeGreaterThan(popular.score);
  });
});
