import { NextResponse } from "next/server";
import { agentTurnRequestSchema, memoryItemSchema } from "@/lib/schemas";
import { interpretTurn } from "@/lib/agent/interpreter";
import { addMemories } from "@/lib/moss/memory";
import { getMossRuntimeMetrics } from "@/lib/moss/client";
import { integrationEvent, safeError, uid } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = agentTurnRequestSchema.parse(await request.json());
    const result = await interpretTurn(input.utterance, input.interviewStep);
    const now = new Date().toISOString();
    const memories = result.interpretation.memories.map((memory) =>
      memoryItemSchema.parse({ ...memory, id: uid("memory"), createdAt: now }),
    );
    const shouldPush = input.interviewStep === 3 || memories.some((memory) => memory.kind === "rejection" && memory.strength === 3);
    const mossStartedAt = performance.now();
    const moss = await addMemories(input.userId, memories, shouldPush, input.tripId);
    const mossDuration = Math.round(performance.now() - mossStartedAt);
    const runtimeMetrics = getMossRuntimeMetrics();
    return NextResponse.json({
      interpretation: result.interpretation,
      acknowledgement: result.interpretation.conciseAcknowledgement,
      memoriesAdded: memories,
      interpreterSource: result.source,
      mossStatus: moss,
      mossSession: {
        indexName: moss.indexName,
        docCount: moss.docCount,
        localIndexStatus: runtimeMetrics.localIndexStatus,
        localAddDurationMs: moss.localUpdateDurationMs ?? mossDuration,
        retrievalStatus: runtimeMetrics.retrievalStatus,
        queryCount: runtimeMetrics.candidateQueryCount,
        retrievalDurationMs: runtimeMetrics.retrievalDurationMs,
        cloudSyncStatus: runtimeMetrics.cloudSync.status,
      },
      integrationEvents: [
        integrationEvent("openai", "interpret utterance", result.source === "OpenAI Live" ? "Live" : "Fallback", result.source, result.durationMs),
        integrationEvent("moss", "local addDocs", moss.mode, moss.detail, moss.localUpdateDurationMs ?? mossDuration),
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to interpret this turn", detail: safeError(error, "Request validation failed") },
      { status: 400 },
    );
  }
}
