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
  return error instanceof Error && error.message ? error.message : fallback;
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
