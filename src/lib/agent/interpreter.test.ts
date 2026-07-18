import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DEFAULT_GEMINI_INTERPRETER_TIMEOUT_MS,
  DEFAULT_GEMINI_MODEL,
  GEMINI_INTERPRETER_MAX_OUTPUT_TOKENS,
  configuredInterpreterTimeoutMs,
  interpretTurn,
} from "@/lib/agent/interpreter";

const fetchMock = vi.fn();
const validInterpretation = {
  intent: "other",
  profilePatch: {},
  memories: [],
  conciseAcknowledgement: "I can work with that.",
};

function geminiResponse(value: unknown = validInterpretation) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
    }),
  };
}

const originalEnvironment = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_INTERPRETER_TIMEOUT_MS: process.env.GEMINI_INTERPRETER_TIMEOUT_MS,
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL = "test-model";
  delete process.env.GEMINI_INTERPRETER_TIMEOUT_MS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("hybrid Gemini turn interpreter", () => {
  it("keeps deterministic commands on the zero-network fast path", async () => {
    const result = await interpretTurn("That feels too touristy");
    expect(result.source).toBe("Local Interpreter");
    expect(result.interpretation).toMatchObject({ intent: "reject" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a recognized interview answer on the zero-network fast path", async () => {
    const result = await interpretTurn("quiet and calm", 0);
    expect(result.source).toBe("Local Interpreter");
    expect(result.interpretation.intent).toBe("interview_answer");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes an unexpected interview answer to Gemini when configured", async () => {
    fetchMock.mockResolvedValue(geminiResponse({
      intent: "interview_answer",
      profilePatch: { ambience: "balanced" },
      memories: [],
      conciseAcknowledgement: "A flexible atmosphere. Got it.",
    }));
    const result = await interpretTurn("something atmospheric", 0);
    expect(result.source).toBe("Gemini Live");
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.contents[0].parts[0].text).toContain("Expected field: ambience");
  });

  it("does not treat a negated interview keyword as high-confidence local input", async () => {
    fetchMock.mockResolvedValue(geminiResponse({
      intent: "interview_answer",
      profilePatch: { interests: ["hidden"] },
      memories: [],
      conciseAcknowledgement: "I will avoid obvious art stops.",
    }));
    const result = await interpretTurn("anything except art", 2);
    expect(result.source).toBe("Gemini Live");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses the local fallback immediately when no API key is configured", async () => {
    delete process.env.GEMINI_API_KEY;
    const result = await interpretTurn("something atmospheric");
    expect(result.source).toBe("Local Interpreter");
    expect(result.interpretation.intent).toBe("other");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends only an unknown turn with the low-latency structured request policy", async () => {
    fetchMock.mockResolvedValue(geminiResponse());
    const result = await interpretTurn("something atmospheric");
    expect(result.source).toBe("Gemini Live");
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.1-flash-lite");
    expect(DEFAULT_GEMINI_INTERPRETER_TIMEOUT_MS).toBe(2_500);
    expect(GEMINI_INTERPRETER_MAX_OUTPUT_TOKENS).toBe(300);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({ "x-goog-api-key": "test-key" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 300,
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: "MINIMAL" },
      },
    });
    expect(body.generationConfig.responseJsonSchema.required).toContain("intent");
    expect(body.systemInstruction.parts[0].text).toContain("GreedyTrip");
  });

  it("uses a bounded timeout override and rejects unsafe values", () => {
    expect(configuredInterpreterTimeoutMs("1200")).toBe(1_200);
    expect(configuredInterpreterTimeoutMs("20")).toBe(2_500);
    expect(configuredInterpreterTimeoutMs("90000")).toBe(2_500);
    expect(configuredInterpreterTimeoutMs("invalid")).toBe(2_500);
  });

  it("falls back locally without retrying on network or quota failure", async () => {
    fetchMock.mockRejectedValue(new Error("quota or network failure"));
    const result = await interpretTurn("something atmospheric");
    expect(result.source).toBe("Local Interpreter");
    expect(result.interpretation.intent).toBe("other");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("falls back locally on non-success HTTP status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: vi.fn() });
    const result = await interpretTurn("something atmospheric");
    expect(result.source).toBe("Local Interpreter");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["empty candidate", { ok: true, status: 200, json: vi.fn().mockResolvedValue({ candidates: [] }) }],
    ["malformed JSON", { ok: true, status: 200, json: vi.fn().mockResolvedValue({ candidates: [{ content: { parts: [{ text: "{" }] } }] }) }],
    ["schema-invalid JSON", geminiResponse({ intent: "invented", profilePatch: {}, memories: [], conciseAcknowledgement: "No" })],
  ])("falls back locally for %s", async (_label, response) => {
    fetchMock.mockResolvedValue(response);
    const result = await interpretTurn("something atmospheric");
    expect(result.source).toBe("Local Interpreter");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
