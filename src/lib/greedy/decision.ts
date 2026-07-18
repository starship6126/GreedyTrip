import { haversineMeters, walkingMinutes } from "@/lib/geo";
import { signedMemoryScore } from "@/lib/scoring/score";
import { clamp, round } from "@/lib/utils";
import { GREEDY_CONFIG } from "@/lib/greedy/types";
import type {
  Candidate,
  CandidateUtility,
  DecisionContext,
  GreedyDecision,
  MemoryEvidence,
} from "@/lib/types";

export type CandidateWithEvidence = { candidate: Candidate; evidence: MemoryEvidence[] };

function mealWindow(date: Date): boolean {
  const hour = date.getHours();
  return (hour >= 11 && hour < 14) || (hour >= 17 && hour < 21);
}

function interestMatch(candidate: Candidate, context: DecisionContext): boolean {
  return context.profile.interests.some((interest) => {
    const tag = interest === "tech" ? "technology" : interest;
    return candidate.tags.includes(tag) || candidate.category.toLowerCase().includes(interest);
  });
}

function categoryKey(candidate: Candidate): string {
  if (candidate.tags.includes("art")) return "art";
  if (candidate.tags.includes("food")) return "food";
  if (candidate.tags.includes("technology")) return "technology";
  if (/book/i.test(candidate.category)) return "books";
  return candidate.category.toLowerCase();
}

export function repetitionPenalty(candidate: Candidate, context: DecisionContext): number {
  const key = categoryKey(candidate);
  if (context.strongCategoryPreference?.toLowerCase() === key) return 0;
  const recent = context.recentCategoryHistory.slice(-3);
  const repeats = recent.filter((category) => category.toLowerCase() === key).length;
  return clamp(repeats * 2, 0, 6);
}

export function calculateCandidateUtility(
  candidate: Candidate,
  evidence: MemoryEvidence[],
  context: DecisionContext,
): CandidateUtility {
  const distance = haversineMeters(context.location, candidate);
  const minutes = walkingMinutes(distance);
  const evidenceCoverage = clamp(
    evidence.reduce((sum, item) => sum + Math.abs(item.contribution), 0) / 4,
    0,
    1,
  );
  const memoryFit = clamp(15 + 15 * signedMemoryScore(evidence) * evidenceCoverage, 0, 30);
  const accessibility = clamp(15 * (1 - Math.max(0, minutes - 1) / Math.max(2, context.profile.maxWalkMinutes)), 0, 15);

  let rightNowOpportunity = candidate.isOpenNow === true ? 9 : 6;
  if (mealWindow(new Date(context.timestamp)) && candidate.tags.includes("food")) rightNowOpportunity += 3;
  if (candidate.closesAt) {
    const remaining = (new Date(candidate.closesAt).getTime() - new Date(context.timestamp).getTime()) / 60_000;
    if (remaining > 0 && remaining <= 75) rightNowOpportunity += 2;
  }
  rightNowOpportunity = clamp(rightNowOpportunity, 0, 12);

  const credible = candidate.rating === undefined || candidate.rating >= 3.8;
  let serendipity = 0;
  if (credible && minutes <= context.profile.maxWalkMinutes) {
    if (interestMatch(candidate, context)) serendipity += 2;
    if (candidate.tags.includes("hidden") || candidate.tags.includes("lesser-known")) serendipity += 3;
    if (candidate.tags.includes("independent")) serendipity += 2;
    if (candidate.reviewCount !== undefined && candidate.reviewCount < 300) serendipity += 3;
    if (candidate.rating !== undefined && candidate.rating >= 4.3) serendipity += 1;
    if (candidate.tags.includes("highly-visited")) serendipity = Math.min(serendipity, 4);
    if (evidence.some((item) => item.contribution < 0)) serendipity = Math.min(serendipity, 2);
  }
  serendipity = clamp(serendipity, 0, 12);

  let localCharacter = 3;
  if (candidate.tags.includes("local")) localCharacter += 2;
  if (candidate.tags.includes("independent")) localCharacter += 3;
  if (candidate.tags.includes("highly-visited") && !candidate.tags.includes("independent")) localCharacter -= 2;
  localCharacter = clamp(localCharacter, 0, 8);

  const quality = candidate.rating === undefined ? 4 : clamp((candidate.rating - 3) * 4, 0, 8);
  const travelFriction = minutes > context.profile.maxWalkMinutes
    ? clamp((minutes - context.profile.maxWalkMinutes) * 2, 0, 10)
    : 0;
  const costPenalty = candidate.priceLevel === undefined
    ? 0
    : clamp(Math.max(0, candidate.priceLevel - 1) * (context.profile.priority === "budget" ? 1.5 : 0.75), 0, 5);

  let crowdRiskPenalty = 0;
  if (candidate.reviewCount !== undefined) {
    if (candidate.reviewCount > 10_000) crowdRiskPenalty += 4;
    else if (candidate.reviewCount > 3_000) crowdRiskPenalty += 2.5;
    else if (candidate.reviewCount > 1_000) crowdRiskPenalty += 1;
  }
  if (candidate.tags.includes("highly-visited")) crowdRiskPenalty += 2;
  if (evidence.some((item) => item.polarity === -1 && /tourist|crowd|noisy/i.test(item.text))) crowdRiskPenalty *= 1.4;
  crowdRiskPenalty = clamp(crowdRiskPenalty, 0, 8);
  const repeatPenalty = repetitionPenalty(candidate, context);

  const total = clamp(
    memoryFit + accessibility + rightNowOpportunity + serendipity + localCharacter + quality -
      travelFriction - costPenalty - crowdRiskPenalty - repeatPenalty,
    0,
    GREEDY_CONFIG.maxPresentedUtility,
  );
  const factors = [
    `${minutes} minute walk`,
    interestMatch(candidate, context) ? "matches a stated interest" : "broadens the current experience",
    candidate.isOpenNow === true ? "source reports open now" : "opening status is neutral",
    candidate.tags.includes("independent") ? "independent-place signal" : "no independent-place signal",
  ];
  return {
    candidateId: candidate.id,
    rank: 0,
    total: round(total, 1),
    memoryFit: round(memoryFit, 1),
    accessibility: round(accessibility, 1),
    rightNowOpportunity: round(rightNowOpportunity, 1),
    serendipity: round(serendipity, 1),
    localCharacter: round(localCharacter, 1),
    quality: round(quality, 1),
    travelFriction: round(travelFriction, 1),
    costPenalty: round(costPenalty, 1),
    crowdRiskPenalty: round(crowdRiskPenalty, 1),
    repetitionPenalty: round(repeatPenalty, 1),
    switchingFriction: 0,
    evidence,
    explanationFactors: factors,
  };
}

export function feasibleCandidateFrontier(
  candidates: CandidateWithEvidence[],
  context: DecisionContext,
): CandidateWithEvidence[] {
  const excluded = new Set(context.excludedCandidateIds);
  const unavailable = new Set(context.unavailableCandidateIds);
  const visited = new Set(context.visitedCandidateIds);
  return candidates.filter(({ candidate }) => {
    if (candidate.isOpenNow === false || excluded.has(candidate.id) || unavailable.has(candidate.id) || visited.has(candidate.id)) return false;
    return walkingMinutes(haversineMeters(context.location, candidate)) <= context.profile.maxWalkMinutes;
  });
}

export function applySwitchingFriction(context: DecisionContext, currentAvailable: boolean): number {
  if (!currentAvailable || context.trigger === "CURRENT_UNAVAILABLE" || context.trigger === "REJECTED" || context.trigger === "MANUAL") return 0;
  return context.currentCandidateAccepted
    ? GREEDY_CONFIG.acceptedSwitchingFriction
    : GREEDY_CONFIG.unacceptedSwitchingFriction;
}

export function shouldInterruptForDecision(input: {
  context: DecisionContext;
  current?: CandidateUtility;
  challenger?: CandidateUtility;
  switchingFriction: number;
}): { shouldInterrupt: boolean; rawGain?: number; netGain?: number; reason: string; silenceReason?: string } {
  const { context, current, challenger, switchingFriction } = input;
  if (!current) {
    const mandatory = context.trigger === "CURRENT_UNAVAILABLE";
    return { shouldInterrupt: true, reason: mandatory ? "Current move became unavailable; replacement is mandatory" : "No current move; commit to the frontier maximum" };
  }
  if (!challenger || challenger.candidateId === current.candidateId) {
    return { shouldInterrupt: false, rawGain: 0, netGain: 0, reason: "Current move remains the frontier maximum", silenceReason: "Context changed. The current move is still best. No interruption needed." };
  }
  const rawGain = round(challenger.total - current.total, 1);
  const netGain = round(rawGain - switchingFriction, 1);
  if (context.trigger === "CURRENT_UNAVAILABLE") {
    return { shouldInterrupt: true, rawGain, netGain: rawGain, reason: "Current move became unavailable; switching friction bypassed" };
  }
  if (context.trigger === "REJECTED" || context.trigger === "MANUAL") {
    return { shouldInterrupt: true, rawGain, netGain: rawGain, reason: "User explicitly requested a different move" };
  }
  if (netGain >= GREEDY_CONFIG.interventionThreshold) {
    return { shouldInterrupt: true, rawGain, netGain, reason: `Net improvement ${netGain.toFixed(1)} crossed the ${GREEDY_CONFIG.interventionThreshold}-point threshold` };
  }
  return {
    shouldInterrupt: false,
    rawGain,
    netGain,
    reason: "Challenger did not justify an interruption",
    silenceReason: "A new option ranked slightly higher, but not enough to interrupt your current move.",
  };
}

export function selectGreedyNextMove(
  candidates: CandidateWithEvidence[],
  context: DecisionContext,
): { decision: GreedyDecision; ranked: CandidateUtility[] } {
  const feasible = feasibleCandidateFrontier(candidates, context);
  if (!feasible.length) throw new Error("No feasible candidates remain in the current frontier");
  const ranked = feasible
    .map(({ candidate, evidence }) => calculateCandidateUtility(candidate, evidence, context))
    .sort((a, b) => b.total - a.total || a.candidateId.localeCompare(b.candidateId))
    .map((utility, index) => ({ ...utility, rank: index + 1 }));
  const frontierBest = ranked[0];
  const current = context.currentCandidateId
    ? ranked.find((utility) => utility.candidateId === context.currentCandidateId)
    : undefined;
  const switchingFriction = applySwitchingFriction(context, Boolean(current));
  const interrupt = shouldInterruptForDecision({ context, current, challenger: frontierBest, switchingFriction });
  const selected = !current || interrupt.shouldInterrupt ? frontierBest : current;
  selected.switchingFriction = switchingFriction;
  return {
    ranked,
    decision: {
      selectedCandidateId: selected.candidateId,
      selectedUtility: selected,
      currentCandidateUtility: current,
      challengerUtility: frontierBest.candidateId === current?.candidateId ? undefined : frontierBest,
      rawGain: interrupt.rawGain,
      switchingFriction,
      netGain: interrupt.netGain,
      shouldInterrupt: interrupt.shouldInterrupt,
      interventionReason: interrupt.reason,
      silenceReason: interrupt.silenceReason,
      trigger: context.trigger,
    },
  };
}
