export type {
  CandidateDecisionDelta,
  CandidateUtility,
  DecisionContext,
  DecisionSnapshot,
  GreedyDecision,
  GreedyExplanation,
} from "@/lib/types";

export const GREEDY_CONFIG = {
  interventionThreshold: 8,
  acceptedSwitchingFriction: 5,
  unacceptedSwitchingFriction: 1,
  walkingMetersPerMinute: 80,
  maxPresentedUtility: 100,
} as const;
