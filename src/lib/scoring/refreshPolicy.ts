import type { RefreshTrigger } from "@/lib/types";

export type RefreshContext = {
  trigger: RefreshTrigger;
  movementMeters: number;
  hasValidCache: boolean;
  untriedNearbyCount: number;
  currentUnavailable: boolean;
  hasFoodCandidates: boolean;
  mealWindowChanged: boolean;
};

export function shouldRefreshCandidates(context: RefreshContext): boolean {
  if (context.trigger === "MANUAL") return true;
  if (context.trigger === "START") return !context.hasValidCache;
  if (context.trigger === "MOVED_300M") return context.movementMeters >= 300 && !context.hasValidCache;
  if (context.trigger === "POOL_LOW") return context.untriedNearbyCount < 3;
  if (context.trigger === "CURRENT_UNAVAILABLE") {
    return context.currentUnavailable && context.untriedNearbyCount < 3;
  }
  if (context.trigger === "MEAL_WINDOW") {
    return context.mealWindowChanged && !context.hasFoodCandidates;
  }
  if (context.trigger === "REJECTED") return context.untriedNearbyCount < 3;
  return false;
}

export function shouldRerank(trigger: RefreshTrigger): boolean {
  return [
    "START",
    "MOVED_300M",
    "REJECTED",
    "CURRENT_UNAVAILABLE",
    "MEAL_WINDOW",
    "CLOSING_WINDOW",
    "POOL_LOW",
    "PREFERENCE_UPDATED",
    "MANUAL",
  ].includes(trigger);
}

export function interventionDecision(input: {
  trigger: RefreshTrigger;
  hasCurrent: boolean;
  currentUnavailable: boolean;
  scoreImprovement: number;
  travelIncreaseMinutes: number;
}): { speak: boolean; reason: string } {
  if (!input.hasCurrent) return { speak: true, reason: "No current recommendation" };
  if (input.currentUnavailable) return { speak: true, reason: "Current place became unavailable" };
  if (input.trigger === "REJECTED") return { speak: true, reason: "User rejected the current option" };
  if (input.scoreImprovement >= 8) return { speak: true, reason: "New option is at least 8 points better" };
  if (input.travelIncreaseMinutes > 5) return { speak: true, reason: "Movement added more than 5 walking minutes" };
  return { speak: false, reason: "Reranked silently; intervention threshold not met" };
}
