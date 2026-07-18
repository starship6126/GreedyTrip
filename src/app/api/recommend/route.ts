import { NextResponse } from "next/server";
import { recommendRequestSchema } from "@/lib/schemas";
import { candidateText } from "@/lib/scoring/candidateText";
import { haversineMeters, walkingMinutes } from "@/lib/geo";
import { localMemories, queryMemoryEvidence } from "@/lib/moss/memory";
import { getMossRuntimeMetrics } from "@/lib/moss/client";
import { buildGreedyExplanation } from "@/lib/greedy/explanations";
import { feasibleCandidateFrontier, selectGreedyNextMove } from "@/lib/greedy/decision";
import { createDecisionSnapshot } from "@/lib/greedy/snapshots";
import { GREEDY_CONFIG } from "@/lib/greedy/types";
import { clamp, integrationEvent, safeError } from "@/lib/utils";
import type { CandidateUtility, DecisionContext, Recommendation, ScoreBreakdown } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = recommendRequestSchema.parse(await request.json());
    const context: DecisionContext = {
      location: input.location,
      timestamp: input.currentTime,
      remainingTravelMinutes: input.remainingTravelMinutes,
      profile: input.profile,
      memoryVersion: Math.max(input.memoryVersion, localMemories(input.userId).length),
      currentCandidateId: input.currentCandidateId,
      currentCandidateAccepted: input.currentCandidateAccepted,
      excludedCandidateIds: input.excludedCandidateIds,
      unavailableCandidateIds: input.unavailableCandidateIds,
      visitedCandidateIds: input.visitedCandidateIds,
      recentCategoryHistory: input.recentCategoryHistory,
      strongCategoryPreference: input.profile.interests.length === 1
        ? (input.profile.interests[0] === "tech" ? "technology" : input.profile.interests[0])
        : undefined,
      trigger: input.trigger,
    };
    const feasible = feasibleCandidateFrontier(
      input.candidates.map((candidate) => ({ candidate, evidence: [] })),
      context,
    );
    const queryBatchStartedAt = performance.now();
    const queried = await Promise.all(
      feasible.map(async ({ candidate }) => {
        const distance = haversineMeters(input.location, candidate);
        const memory = await queryMemoryEvidence(input.userId, candidateText(candidate, distance), input.tripId);
        return { candidate, memory };
      }),
    );
    const queryBatchDurationMs = Math.round(performance.now() - queryBatchStartedAt);
    const greedy = selectGreedyNextMove(
      queried.map(({ candidate, memory }) => ({ candidate, evidence: memory.evidence })),
      context,
    );
    const candidateById = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
    const toBreakdown = (utility: CandidateUtility): ScoreBreakdown => ({
      preferenceMatch: utility.memoryFit,
      accessibility: clamp((utility.accessibility / 15) * 20, 0, 20),
      rarity: clamp(utility.serendipity + utility.localCharacter / 2, 0, 15),
      timeRelevance: clamp((utility.rightNowOpportunity / 12) * 15, 0, 15),
      quality: clamp((utility.quality / 8) * 10, 0, 10),
      costPenalty: utility.costPenalty,
      waitRiskPenalty: utility.crowdRiskPenalty,
      total: utility.total,
    });
    const toRecommendation = (utility: CandidateUtility): Recommendation => {
      const candidate = candidateById.get(utility.candidateId);
      if (!candidate) throw new Error("Selected candidate was not found");
      const explanation = buildGreedyExplanation(candidate, utility, context);
      const whyThis = explanation.whyThis.replace(/\.$/, "");
      const whyNow = explanation.whyNow.replace(/\.$/, "");
      return {
        candidate,
        score: utility.total,
        breakdown: toBreakdown(utility),
        evidence: utility.evidence,
        walkingMinutes: walkingMinutes(haversineMeters(input.location, candidate)),
        conciseReason: `${candidate.name} is the best current move: ${whyThis}, and ${whyNow.toLowerCase()}.`,
        interventionReason: greedy.decision.interventionReason,
        utility,
        explanation,
      };
    };
    const selected = toRecommendation(greedy.decision.selectedUtility);
    const rankedRecommendations = greedy.ranked.map(toRecommendation);
    const snapshot = createDecisionSnapshot(greedy.decision, greedy.ranked, input.candidates, context);

    const liveQueries = queried.filter((item) => item.memory.mode === "Live");
    const mossMode = liveQueries.length === queried.length ? "Live" : "Fallback";
    const allEvidence = selected.evidence;
    const strongestEvidence = [...allEvidence].sort(
      (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
    )[0];
    const runtimeMetrics = getMossRuntimeMetrics();
    const firstQuery = queried[0]?.memory;
    return NextResponse.json({
      recommendation: selected,
      rankedTopFive: rankedRecommendations.slice(0, 5),
      decision: greedy.decision,
      decisionSnapshot: snapshot,
      frontierCount: greedy.ranked.length,
      greedyConfig: GREEDY_CONFIG,
      mossEvidence: {
        positive: allEvidence.filter((item) => item.contribution > 0).slice(0, 3),
        negative: allEvidence.filter((item) => item.contribution < 0).slice(0, 3),
      },
      mossStatus: mossMode,
      mossQueryDurationMs: queryBatchDurationMs,
      mossSession: {
        indexName: firstQuery?.indexName ?? runtimeMetrics.indexName,
        docCount: firstQuery?.docCount ?? runtimeMetrics.localDocumentCount,
        localIndexStatus: runtimeMetrics.localIndexStatus,
        localAddDurationMs: runtimeMetrics.localUpdateDurationMs,
        retrievalStatus: mossMode === "Live" ? "live" : "fallback",
        queryCount: queried.reduce((sum, item) => sum + item.memory.queryCount, 0),
        retrievalDurationMs: queryBatchDurationMs,
        cloudSyncStatus: runtimeMetrics.cloudSync.status,
        lastMemoryText: strongestEvidence?.text,
        lastSimilarity: strongestEvidence?.similarity,
        lastPolarity: strongestEvidence?.polarity,
        lastStrength: strongestEvidence?.strength,
        memoryFitDelta: selected.utility ? Math.round((selected.utility.memoryFit - 15) * 10) / 10 : undefined,
      },
      intervention: {
        speak: greedy.decision.shouldInterrupt,
        reason: greedy.decision.interventionReason,
        silenceReason: greedy.decision.silenceReason,
        trigger: input.trigger,
      },
      integrationEvents: [
        integrationEvent("moss", "query every feasible candidate", mossMode, `${queried.length} feasible candidate descriptions queried`, queryBatchDurationMs),
        integrationEvent("agent", "greedy argmax decision", greedy.decision.shouldInterrupt ? "Commit" : "Silent", `${greedy.ranked.length} feasible candidates scored; trigger ${input.trigger}`),
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to calculate the next move", detail: safeError(error, "Request validation failed") },
      { status: 400 },
    );
  }
}
