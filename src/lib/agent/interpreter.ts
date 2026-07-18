import "server-only";

import { interpretLocally } from "@/lib/agent/fallbackInterpreter";
import { INTERPRETER_SYSTEM_PROMPT } from "@/lib/agent/prompts";
import { turnInterpretationSchema } from "@/lib/schemas";
import type { TurnInterpretation } from "@/lib/types";

export const DEFAULT_GEMINI_INTERPRETER_TIMEOUT_MS = 2_500;
export const GEMINI_INTERPRETER_MAX_OUTPUT_TOKENS = 300;
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const TURN_INTERPRETATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: [
        "interview_answer",
        "accept",
        "reject",
        "show_map",
        "show_photos",
        "explain",
        "repeat",
        "report_closed",
        "report_bad",
        "pause",
        "resume",
        "other",
      ],
    },
    profilePatch: {
      type: "object",
      additionalProperties: false,
      properties: {
        ambience: { type: "string", enum: ["quiet", "lively", "balanced"] },
        maxWalkMinutes: { type: "integer", enum: [5, 10, 20] },
        interests: {
          type: "array",
          items: { type: "string", enum: ["art", "food", "tech", "hidden"] },
          maxItems: 4,
        },
        priority: { type: "string", enum: ["budget", "uniqueness", "comfort", "balanced"] },
      },
    },
    memories: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", minLength: 3, maxLength: 240 },
          polarity: { type: "integer", enum: [-1, 1] },
          strength: { type: "integer", enum: [1, 2, 3] },
          topic: {
            type: "string",
            enum: ["ambience", "walking", "interest", "budget", "touristy", "crowding", "availability", "comfort", "other"],
          },
          kind: { type: "string", enum: ["interview", "acceptance", "rejection"] },
        },
        required: ["text", "polarity", "strength", "topic", "kind"],
      },
    },
    conciseAcknowledgement: { type: "string", minLength: 1, maxLength: 180 },
    feedbackReason: { type: "string", maxLength: 240 },
  },
  required: ["intent", "profilePatch", "memories", "conciseAcknowledgement"],
} as const;

const INTERVIEW_LOCAL_PATTERNS: Record<number, RegExp> = {
  0: /quiet|calm|peace|lively|social|energy|busy|balanced|mix|both|조용|차분|평화|활기|사교|균형|둘 다/i,
  1: /\b(?:5|10|20|five|ten|twenty)\b|(?:5|10|20)\s*분|오분|십분|이십분/i,
  2: /art|gallery|design|food|restaurant|eat|tech|technology|science|hidden|local|gem|unusual|미술|예술|갤러리|디자인|음식|맛집|식당|기술|과학|숨은|로컬|현지/i,
  3: /cost|budget|cheap|low|comfort|dark|unique|unusual|different|balanced|가격|예산|저렴|편안|안전|독특|특별|균형/i,
};
const AMBIGUOUS_INTERVIEW_PATTERN = /\b(?:not|don'?t|except|but|rather|instead)\b|말고|빼고|아니|싫/i;

export function configuredInterpreterTimeoutMs(value = process.env.GEMINI_INTERPRETER_TIMEOUT_MS): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 250 && parsed <= 5_000
    ? Math.round(parsed)
    : DEFAULT_GEMINI_INTERPRETER_TIMEOUT_MS;
}

function interpreterUserInput(utterance: string, interviewStep?: number): string {
  const expectedField = interviewStep === 0
    ? "ambience: quiet, lively, or balanced"
    : interviewStep === 1
      ? "maxWalkMinutes: 5, 10, or 20"
      : interviewStep === 2
        ? "interests: art, food, tech, or hidden"
        : interviewStep === 3
          ? "priority: budget, uniqueness, comfort, or balanced"
          : "none";
  return `Interview step: ${interviewStep ?? "none"}. Expected field: ${expectedField}. Utterance: ${utterance}`;
}

function isDeterministicLocalResult(utterance: string, result: TurnInterpretation, interviewStep?: number): boolean {
  if (result.intent !== "other" && result.intent !== "interview_answer") return true;
  if (interviewStep === undefined) return result.intent !== "other";
  if (AMBIGUOUS_INTERVIEW_PATTERN.test(utterance)) return false;
  return INTERVIEW_LOCAL_PATTERNS[interviewStep]?.test(utterance) === true;
}

function geminiResponseText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return undefined;
  const first = candidates[0];
  if (!first || typeof first !== "object") return undefined;
  const content = (first as { content?: unknown }).content;
  if (!content || typeof content !== "object") return undefined;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return undefined;
  const text = parts
    .map((part) => part && typeof part === "object" ? (part as { text?: unknown }).text : undefined)
    .filter((value): value is string => typeof value === "string")
    .join("")
    .trim();
  return text || undefined;
}

export async function interpretTurn(
  utterance: string,
  interviewStep?: number,
): Promise<{ interpretation: TurnInterpretation; source: "Gemini Live" | "Local Interpreter"; durationMs: number }> {
  const startedAt = performance.now();
  const local = interpretLocally(utterance, interviewStep);
  const apiKey = process.env.GEMINI_API_KEY;
  if (isDeterministicLocalResult(utterance, local, interviewStep) || !apiKey) {
    return { interpretation: local, source: "Local Interpreter", durationMs: Math.round(performance.now() - startedAt) };
  }

  try {
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    const response = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INTERPRETER_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: interpreterUserInput(utterance, interviewStep) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: TURN_INTERPRETATION_JSON_SCHEMA,
          maxOutputTokens: GEMINI_INTERPRETER_MAX_OUTPUT_TOKENS,
          temperature: 0.1,
          thinkingConfig: { thinkingLevel: "MINIMAL" },
        },
      }),
      signal: AbortSignal.timeout(configuredInterpreterTimeoutMs()),
    });
    if (!response.ok) throw new Error(`Gemini request failed with HTTP ${response.status}`);
    const text = geminiResponseText(await response.json());
    if (!text) throw new Error("No structured Gemini interpretation returned");
    return {
      interpretation: turnInterpretationSchema.parse(JSON.parse(text)),
      source: "Gemini Live",
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return { interpretation: local, source: "Local Interpreter", durationMs: Math.round(performance.now() - startedAt) };
  }
}
