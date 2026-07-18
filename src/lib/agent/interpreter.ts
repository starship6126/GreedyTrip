import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { interpretLocally } from "@/lib/agent/fallbackInterpreter";
import { INTERPRETER_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import { turnInterpretationSchema } from "@/lib/schemas";
import type { TurnInterpretation } from "@/lib/types";

function isDeterministicLocalResult(result: TurnInterpretation, interviewStep?: number): boolean {
  return result.intent !== "other" || interviewStep !== undefined;
}

export async function interpretTurn(
  utterance: string,
  interviewStep?: number,
): Promise<{ interpretation: TurnInterpretation; source: "OpenAI Live" | "Local Interpreter"; durationMs: number }> {
  const startedAt = performance.now();
  const local = interpretLocally(utterance, interviewStep);
  if (isDeterministicLocalResult(local, interviewStep) || !process.env.OPENAI_API_KEY) {
    return { interpretation: local, source: "Local Interpreter", durationMs: Math.round(performance.now() - startedAt) };
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.parse(
      {
        model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
        reasoning: { effort: "low" },
        input: [
          { role: "system", content: INTERPRETER_SYSTEM_PROMPT },
          { role: "user", content: `Utterance: ${utterance}` },
        ],
        text: { format: zodTextFormat(turnInterpretationSchema, "turn_interpretation") },
      },
      { timeout: 8_000 },
    );
    if (!response.output_parsed) throw new Error("No parsed interpretation returned");
    return {
      interpretation: turnInterpretationSchema.parse(response.output_parsed),
      source: "OpenAI Live",
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return { interpretation: local, source: "Local Interpreter", durationMs: Math.round(performance.now() - startedAt) };
  }
}
