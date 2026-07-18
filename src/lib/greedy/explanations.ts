import { walkingMinutes, haversineMeters } from "@/lib/geo";
import type { Candidate, CandidateUtility, DecisionContext, GreedyExplanation } from "@/lib/types";

export function buildGreedyExplanation(
  candidate: Candidate,
  utility: CandidateUtility,
  context: DecisionContext,
): GreedyExplanation {
  const strongestMemory = [...utility.evidence]
    .filter((item) => item.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)[0];
  const whyThis = strongestMemory
    ? `Strong match with: “${strongestMemory.text}”`
    : utility.serendipity >= 7
      ? "A credible, less-obvious discovery with strong serendipity value."
      : "The strongest feasible blend of fit, access, and available quality signals.";
  const minutes = walkingMinutes(haversineMeters(context.location, candidate));
  const whyNow = candidate.isOpenNow === true
    ? `${minutes} minutes away and reported open in the source data.`
    : `${minutes} minutes away and feasible now; current opening status is unknown.`;
  let whatChanged = "This is the highest-value option after the initial preference interview.";
  if (context.trigger === "REJECTED") whatChanged = "Your latest feedback changed the memory heuristic and every remaining candidate was rescored.";
  else if (context.trigger === "MOVED_300M") whatChanged = "Your location changed, so accessibility and the feasible frontier were recomputed.";
  else if (context.trigger === "CURRENT_UNAVAILABLE") whatChanged = "The previous move became unavailable, so switching friction was removed and a replacement was required.";
  else if (context.trigger === "MANUAL") whatChanged = "You requested a fresh decision, so the current frontier was recomputed.";
  return { whyThis, whyNow, whatChanged };
}
