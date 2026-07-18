import { describe, expect, it } from "vitest";
import fixtureData from "@/data/powell-candidates.fixture.json";
import { candidateSchema } from "@/lib/schemas";
import {
  applySwitchingFriction,
  calculateCandidateUtility,
  feasibleCandidateFrontier,
  repetitionPenalty,
  selectGreedyNextMove,
  shouldInterruptForDecision,
} from "@/lib/greedy/decision";
import { buildGreedyExplanation } from "@/lib/greedy/explanations";
import { compareDecisionSnapshots, createDecisionSnapshot } from "@/lib/greedy/snapshots";
import { GREEDY_CONFIG } from "@/lib/greedy/types";
import type { Candidate, CandidateUtility, DecisionContext, MemoryEvidence } from "@/lib/types";

const candidates = fixtureData.map((item) => candidateSchema.parse(item));
const profile = { ambience: "quiet" as const, maxWalkMinutes: 10 as const, interests: ["art" as const, "hidden" as const], priority: "uniqueness" as const, interviewComplete: true };

function context(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    location: { lat: 37.7841, lng: -122.4075, label: "Powell Street Station" },
    timestamp: "2026-07-18T15:00:00-07:00",
    profile,
    memoryVersion: 4,
    currentCandidateAccepted: false,
    excludedCandidateIds: [],
    unavailableCandidateIds: [],
    visitedCandidateIds: [],
    recentCategoryHistory: [],
    trigger: "START",
    ...overrides,
  };
}

const quiet: MemoryEvidence = { memoryId: "quiet", text: "The user prefers quiet, calm places.", similarity: 0.8, polarity: 1, strength: 2, contribution: 1.6 };
const hidden: MemoryEvidence = { memoryId: "hidden", text: "The user enjoys hidden gems and independent local places.", similarity: 0.8, polarity: 1, strength: 2, contribution: 1.6 };
const touristy: MemoryEvidence = { memoryId: "touristy", text: "The user strongly dislikes tourist-oriented attractions.", similarity: 0.9, polarity: -1, strength: 3, contribution: -2.7 };

function evidenceFor(candidate: Candidate, afterFeedback = false): MemoryEvidence[] {
  const evidence: MemoryEvidence[] = [];
  if (candidate.tags.includes("quiet-place-heuristic")) evidence.push(quiet);
  if (candidate.tags.some((tag) => ["hidden", "independent", "local"].includes(tag))) evidence.push(hidden);
  if (afterFeedback && candidate.tags.includes("tourist-oriented-heuristic")) evidence.push(touristy);
  return evidence;
}

function utility(id: string, total: number): CandidateUtility {
  return {
    candidateId: id, rank: 1, total, memoryFit: 15, accessibility: 10,
    rightNowOpportunity: 6, serendipity: 4, localCharacter: 4, quality: 4,
    travelFriction: 0, costPenalty: 0, crowdRiskPenalty: 0, repetitionPenalty: 0,
    switchingFriction: 0, evidence: [], explanationFactors: [],
  };
}

describe("one-step greedy decision engine", () => {
  it("always selects the maximum final utility candidate", () => {
    const result = selectGreedyNextMove(candidates.map((candidate) => ({ candidate, evidence: evidenceFor(candidate) })), context());
    expect(result.decision.selectedCandidateId).toBe(result.ranked[0].candidateId);
    expect(result.ranked[0].total).toBe(Math.max(...result.ranked.map((item) => item.total)));
  });

  it("keeps closed, excluded, and beyond-limit places out of the frontier", () => {
    const closed = candidates.find((item) => item.isOpenNow === false);
    const excluded = candidates.find((item) => item.id === "fixture-fifth-studio")!;
    const far: Candidate = { ...excluded, id: "far", lat: 37.82 };
    const frontier = feasibleCandidateFrontier(
      [...candidates, far].map((candidate) => ({ candidate, evidence: [] })),
      context({ excludedCandidateIds: [excluded.id] }),
    );
    expect(frontier.some((item) => item.candidate.id === closed?.id)).toBe(false);
    expect(frontier.some((item) => item.candidate.id === excluded.id)).toBe(false);
    expect(frontier.some((item) => item.candidate.id === far.id)).toBe(false);
  });

  it("lowers a popular candidate's Memory Fit after touristy feedback", () => {
    const popular = candidates.find((item) => item.id === "fixture-design-exchange")!;
    const before = calculateCandidateUtility(popular, evidenceFor(popular), context());
    const after = calculateCandidateUtility(popular, evidenceFor(popular, true), context({ trigger: "REJECTED" }));
    expect(after.memoryFit).toBeLessThan(before.memoryFit);
    expect(after.crowdRiskPenalty).toBeGreaterThan(before.crowdRiskPenalty);
  });

  it("creates the deterministic fixture flip from popular to independent", () => {
    const initial = selectGreedyNextMove(candidates.map((candidate) => ({ candidate, evidence: evidenceFor(candidate) })), context());
    expect(initial.decision.selectedCandidateId).toBe("fixture-design-exchange");
    const after = selectGreedyNextMove(
      candidates.map((candidate) => ({ candidate, evidence: evidenceFor(candidate, true) })),
      context({ trigger: "REJECTED", currentCandidateId: initial.decision.selectedCandidateId, excludedCandidateIds: [initial.decision.selectedCandidateId], memoryVersion: 5 }),
    );
    expect(after.decision.selectedCandidateId).toBe("fixture-minna-window");
    expect(candidates.find((item) => item.id === after.decision.selectedCandidateId)?.tags).toContain("independent");
  });

  it("produces correct before/after rank deltas", () => {
    const initial = selectGreedyNextMove(candidates.map((candidate) => ({ candidate, evidence: evidenceFor(candidate) })), context());
    const before = createDecisionSnapshot(initial.decision, initial.ranked, candidates, context());
    const afterContext = context({ trigger: "REJECTED", excludedCandidateIds: [initial.decision.selectedCandidateId], memoryVersion: 5 });
    const changed = selectGreedyNextMove(candidates.map((candidate) => ({ candidate, evidence: evidenceFor(candidate, true) })), afterContext);
    const after = createDecisionSnapshot(changed.decision, changed.ranked, candidates, afterContext);
    const deltas = compareDecisionSnapshots(before, after, "Touristy memory");
    const winner = deltas.find((item) => item.candidateId === after.selectedCandidateId)!;
    expect(winner.afterRank).toBe(1);
    expect(deltas.find((item) => item.candidateId === before.selectedCandidateId)?.afterRank).toBeUndefined();
  });

  it("recomputes after movement while remaining silent below threshold", () => {
    const initial = selectGreedyNextMove(candidates.map((candidate) => ({ candidate, evidence: evidenceFor(candidate) })), context());
    const moved = selectGreedyNextMove(
      candidates.map((candidate) => ({ candidate, evidence: evidenceFor(candidate) })),
      context({ location: { lat: 37.7851, lng: -122.4024, label: "Yerba Buena" }, trigger: "MOVED_300M", currentCandidateId: initial.decision.selectedCandidateId }),
    );
    expect(moved.decision.trigger).toBe("MOVED_300M");
    expect(moved.decision.shouldInterrupt).toBe(false);
    expect(moved.decision.silenceReason).toBeTruthy();
  });

  it("interrupts only when net gain crosses the exported threshold", () => {
    const current = utility("current", 70);
    const below = shouldInterruptForDecision({ context: context({ trigger: "MOVED_300M" }), current, challenger: utility("new", 78), switchingFriction: 1 });
    const above = shouldInterruptForDecision({ context: context({ trigger: "MOVED_300M" }), current, challenger: utility("new", 80), switchingFriction: 1 });
    expect(below.netGain).toBe(7);
    expect(below.shouldInterrupt).toBe(false);
    expect(above.netGain).toBeGreaterThanOrEqual(GREEDY_CONFIG.interventionThreshold);
    expect(above.shouldInterrupt).toBe(true);
  });

  it("switching friction prevents a marginal reroute after acceptance", () => {
    const accepted = context({ trigger: "MOVED_300M", currentCandidateAccepted: true });
    const friction = applySwitchingFriction(accepted, true);
    const result = shouldInterruptForDecision({ context: accepted, current: utility("current", 70), challenger: utility("new", 80), switchingFriction: friction });
    expect(friction).toBe(GREEDY_CONFIG.acceptedSwitchingFriction);
    expect(result.shouldInterrupt).toBe(false);
  });

  it("unavailable current move bypasses switching friction", () => {
    const unavailable = context({ trigger: "CURRENT_UNAVAILABLE", currentCandidateAccepted: true });
    expect(applySwitchingFriction(unavailable, false)).toBe(0);
    expect(shouldInterruptForDecision({ context: unavailable, challenger: utility("replacement", 60), switchingFriction: 0 }).shouldInterrupt).toBe(true);
  });

  it("penalizes repetition unless a strong category preference overrides it", () => {
    const gallery = candidates.find((item) => item.tags.includes("art"))!;
    expect(repetitionPenalty(gallery, context({ recentCategoryHistory: ["art", "art", "food"] }))).toBe(4);
    expect(repetitionPenalty(gallery, context({ recentCategoryHistory: ["art", "art", "art"], strongCategoryPreference: "art" }))).toBe(0);
  });

  it("returns one active action and no multi-stop itinerary", () => {
    const result = selectGreedyNextMove(candidates.map((candidate) => ({ candidate, evidence: [] })), context());
    expect(typeof result.decision.selectedCandidateId).toBe("string");
    expect(Object.hasOwn(result.decision, "itinerary")).toBe(false);
  });

  it("builds WHY THIS, WHY NOW, and WHAT CHANGED from real inputs", () => {
    const candidate = candidates[0];
    const candidateUtility = calculateCandidateUtility(candidate, evidenceFor(candidate), context());
    const explanation = buildGreedyExplanation(candidate, candidateUtility, context());
    expect(explanation.whyThis.length).toBeGreaterThan(10);
    expect(explanation.whyNow).toContain("minutes");
    expect(explanation.whatChanged).toContain("initial preference interview");
  });

  it("keeps unknown hours, price, and crowd inputs neutral", () => {
    const unknown: Candidate = { ...candidates[1], reviewCount: undefined, rating: undefined, priceLevel: undefined, isOpenNow: null, tags: ["art"] };
    const value = calculateCandidateUtility(unknown, [], context());
    expect(value.rightNowOpportunity).toBe(6);
    expect(value.costPenalty).toBe(0);
    expect(value.crowdRiskPenalty).toBe(0);
  });
});
