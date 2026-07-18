import type {
  Candidate,
  CandidateDecisionDelta,
  CandidateUtility,
  DecisionContext,
  DecisionSnapshot,
  GreedyDecision,
} from "@/lib/types";
import { round, uid } from "@/lib/utils";

export function createDecisionSnapshot(
  decision: GreedyDecision,
  ranked: CandidateUtility[],
  candidates: Candidate[],
  context: DecisionContext,
): DecisionSnapshot {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return {
    id: uid("decision"),
    timestamp: context.timestamp,
    trigger: context.trigger,
    contextSummary: `${context.location.label}; ${ranked.length} feasible candidates; ${context.recentCategoryHistory.length} recent categories`,
    memoryVersion: context.memoryVersion,
    selectedCandidateId: decision.selectedCandidateId,
    selectedScore: decision.selectedUtility.total,
    // Keep the full demo frontier for evidence-impact auditing. Normal users and
    // Judge View still render only the explicitly chosen top slices.
    rankedCandidates: ranked.slice(0, 10).map((utility) => ({
      candidateId: utility.candidateId,
      name: byId.get(utility.candidateId)?.name ?? utility.candidateId,
      category: byId.get(utility.candidateId)?.category ?? "Unknown",
      rank: utility.rank,
      score: utility.total,
    })),
    shouldInterrupt: decision.shouldInterrupt,
    interventionReason: decision.interventionReason,
    silenceReason: decision.silenceReason,
  };
}

export function compareDecisionSnapshots(
  before: DecisionSnapshot,
  after: DecisionSnapshot,
  cause = "Context and memory evidence were recomputed",
): CandidateDecisionDelta[] {
  const ids = new Set([
    ...before.rankedCandidates.map((item) => item.candidateId),
    ...after.rankedCandidates.map((item) => item.candidateId),
  ]);
  return [...ids].map((candidateId) => {
    const beforeItem = before.rankedCandidates.find((item) => item.candidateId === candidateId);
    const afterItem = after.rankedCandidates.find((item) => item.candidateId === candidateId);
    return {
      candidateId,
      beforeRank: beforeItem?.rank,
      afterRank: afterItem?.rank,
      beforeScore: beforeItem?.score,
      afterScore: afterItem?.score,
      scoreDelta: round((afterItem?.score ?? 0) - (beforeItem?.score ?? 0), 1),
      primaryCauses: [afterItem ? cause : "Excluded from the feasible frontier"],
    };
  });
}
