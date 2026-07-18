import type { IntegrationEvent } from "@/lib/types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, precision = 1): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function uid(prefix = "id"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function integrationEvent(
  system: IntegrationEvent["system"],
  action: string,
  status: string,
  detail: string,
  durationMs?: number,
): IntegrationEvent {
  return {
    id: uid("event"),
    timestamp: new Date().toISOString(),
    system,
    action,
    status,
    durationMs,
    detail,
  };
}

export function safeError(error: unknown, fallback: string): string {
  const raw = error instanceof Error && error.message ? error.message : fallback;
  const configuredSecrets = [
    process.env.MOSS_PROJECT_ID,
    process.env.MOSS_PROJECT_KEY,
    process.env.BRIGHTDATA_API_KEY,
    process.env.GEMINI_API_KEY,
  ].filter((value): value is string => Boolean(value && value.length >= 6));

  let sanitized = raw;
  for (const secret of configuredSecrets) {
    sanitized = sanitized.replaceAll(secret, "[redacted]");
  }

  sanitized = sanitized
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/gi, "[redacted]")
    .replace(/([?&](?:api[_-]?key|token|secret|key)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(["']?(?:api[_-]?key|project[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .trim();

  return (sanitized || fallback).slice(0, 500);
}

export function tokenize(value: string): Set<string> {
  const stop = new Set(["the", "and", "for", "with", "user", "place", "this", "that", "from", "heuristic"]);
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stop.has(token)),
  );
}
