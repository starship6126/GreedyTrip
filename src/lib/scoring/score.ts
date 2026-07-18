import { haversineMeters, walkingMinutes } from "@/lib/geo";
import { clamp, round } from "@/lib/utils";
import type {
  Candidate,
  GeoPoint,
  MemoryEvidence,
  Recommendation,
  ScoreBreakdown,
  UserProfile,
} from "@/lib/types";

export type ScoreInput = {
  candidate: Candidate;
  location: GeoPoint;
  profile: UserProfile;
  evidence: MemoryEvidence[];
  currentTime: Date;
  interventionReason?: string;
};

export function hardFilterCandidates(
  candidates: Candidate[],
  location: GeoPoint,
  maxWalkMinutes: number,
  excludedIds: Set<string> = new Set(),
  unavailableIds: Set<string> = new Set(),
): Candidate[] {
  return candidates.filter((candidate) => {
    if (excludedIds.has(candidate.id) || unavailableIds.has(candidate.id)) return false;
    if (candidate.isOpenNow === false) return false;
    const minutes = walkingMinutes(haversineMeters(location, candidate));
    return minutes <= maxWalkMinutes + 5;
  });
}

export function signedMemoryScore(evidence: MemoryEvidence[]): number {
  if (!evidence.length) return 0;
  const denominator = evidence.reduce(
    (sum, item) => sum + Math.abs(item.similarity * item.strength),
    0,
  );
  if (denominator === 0) return 0;
  return clamp(
    evidence.reduce((sum, item) => sum + item.contribution, 0) / denominator,
    -1,
    1,
  );
}

function preferenceMatch(evidence: MemoryEvidence[]): number {
  return clamp(15 + 15 * signedMemoryScore(evidence), 0, 30);
}

function accessibility(minutes: number, maxMinutes: number): number {
  if (minutes <= 2) return 20;
  const range = Math.max(4, maxMinutes + 3);
  return clamp(20 * (1 - (minutes - 2) / range), 0, 20);
}

function rarity(candidate: Candidate): number {
  let value = 7;
  if (candidate.reviewCount !== undefined) {
    if (candidate.reviewCount < 100) value = 11;
    else if (candidate.reviewCount < 350) value = 9.5;
    else if (candidate.reviewCount < 1500) value = 7;
    else if (candidate.reviewCount < 5000) value = 4;
    else value = 1.5;
  }
  if (candidate.tags.some((tag) => ["independent", "hidden", "lesser-known"].includes(tag))) value += 3;
  if (candidate.rating !== undefined && candidate.rating < 3.5) value -= 3;
  return clamp(value, 0, 15);
}

function isMealWindow(date: Date): boolean {
  const hour = date.getHours();
  return (hour >= 11 && hour < 14) || (hour >= 17 && hour < 21);
}

function timeRelevance(candidate: Candidate, currentTime: Date): number {
  let value = candidate.isOpenNow === true ? 10 : 7.5;
  if (isMealWindow(currentTime) && candidate.tags.includes("food")) value += 3;
  if (candidate.closesAt) {
    const closing = new Date(candidate.closesAt).getTime();
    const remainingMinutes = (closing - currentTime.getTime()) / 60_000;
    if (remainingMinutes > 0 && remainingMinutes <= 75) value += 2;
  }
  return clamp(value, 0, 15);
}

function quality(candidate: Candidate): number {
  if (candidate.rating === undefined) return 5;
  return clamp((candidate.rating - 3) * 5, 0, 10);
}

function costPenalty(candidate: Candidate, profile: UserProfile): number {
  if (candidate.priceLevel === undefined) return 0;
  const multiplier = profile.priority === "budget" ? 1.4 : 0.75;
  return clamp(Math.max(0, candidate.priceLevel - 1) * multiplier, 0, 5);
}

function waitRiskPenalty(candidate: Candidate, evidence: MemoryEvidence[]): number {
  let risk = 0;
  if (candidate.reviewCount !== undefined) {
    if (candidate.reviewCount > 10_000) risk += 5;
    else if (candidate.reviewCount > 3_000) risk += 3;
    else if (candidate.reviewCount > 1_000) risk += 1.5;
  }
  if (candidate.tags.includes("highly-visited")) risk += 2;
  const crowdSensitive = evidence.some(
    (item) => item.polarity === -1 && /tourist|crowd|noisy/i.test(item.text),
  );
  if (crowdSensitive) risk *= 1.5;
  return clamp(risk, 0, 10);
}

function recommendationReason(
  candidate: Candidate,
  walking: number,
  breakdown: ScoreBreakdown,
): string {
  const reasons: Array<{ value: number; text: string }> = [
    { value: breakdown.preferenceMatch / 30, text: "a strong preference match" },
    { value: breakdown.accessibility / 20, text: `${walking} minutes away` },
    { value: breakdown.rarity / 15, text: "a lesser-known feel by review-volume heuristic" },
    { value: breakdown.timeRelevance / 15, text: "good timing for right now" },
    { value: breakdown.quality / 10, text: "solid available quality signals" },
  ];
  const chosen = reasons.sort((a, b) => b.value - a.value).slice(0, 3).map((item) => item.text);
  return `${candidate.name} is ${chosen[0]}, ${chosen[1]}, and ${chosen[2]}.`;
}

export function scoreCandidate(input: ScoreInput): Recommendation {
  const distance = haversineMeters(input.location, input.candidate);
  const walking = walkingMinutes(distance);
  const breakdown: ScoreBreakdown = {
    preferenceMatch: preferenceMatch(input.evidence),
    accessibility: accessibility(walking, input.profile.maxWalkMinutes),
    rarity: rarity(input.candidate),
    timeRelevance: timeRelevance(input.candidate, input.currentTime),
    quality: quality(input.candidate),
    costPenalty: costPenalty(input.candidate, input.profile),
    waitRiskPenalty: waitRiskPenalty(input.candidate, input.evidence),
    total: 0,
  };
  breakdown.total = clamp(
    breakdown.preferenceMatch +
      breakdown.accessibility +
      breakdown.rarity +
      breakdown.timeRelevance +
      breakdown.quality -
      breakdown.costPenalty -
      breakdown.waitRiskPenalty,
    0,
    90,
  );
  for (const key of Object.keys(breakdown) as Array<keyof ScoreBreakdown>) {
    breakdown[key] = round(breakdown[key], 1);
  }

  return {
    candidate: input.candidate,
    score: breakdown.total,
    breakdown,
    evidence: [...input.evidence].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    walkingMinutes: walking,
    conciseReason: recommendationReason(input.candidate, walking, breakdown),
    interventionReason: input.interventionReason ?? "Initial recommendation",
  };
}
