/**
 * FJ-11 — Reconnect / replay sequence resolution for stream consumers.
 *
 * Mirrors the server-side replay contract (Last-Event-ID header +
 * ?sinceSequence param, as implemented in the coding SSE route and the
 * gateway resumable stream) so consumers can compute a deterministic
 * replay start and detect resumability.
 *
 * Pure + testable in the node environment.
 */

export interface ReplayStartInput {
  /** Raw value of the Last-Event-ID header (may be null). */
  lastEventId: string | null;
  /** Raw value of the sinceSequence search param (may be null). */
  sinceSequence: string | null;
}

export interface ReplayStart {
  /** Sequence to resume from (exclusive). */
  since: number;
  /** How the start was derived — for diagnostics and tests. */
  source: "last-event-id" | "since-sequence" | "none";
}

export function parseSequence(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Resolve the replay start from Last-Event-ID (preferred) or sinceSequence.
 * Same precedence as the server routes: header wins over query param.
 */
export function resolveReplayStart(input: ReplayStartInput): ReplayStart {
  const fromHeader = parseSequence(input.lastEventId);
  if (fromHeader !== null) return { since: fromHeader, source: "last-event-id" };
  const fromParam = parseSequence(input.sinceSequence);
  if (fromParam !== null) return { since: fromParam, source: "since-sequence" };
  return { since: 0, source: "none" };
}

/**
 * Build the query string for a replay request. When `since > 0`, appends
 * `sinceSequence=<n>`; returns an empty string otherwise.
 */
export function buildReplayQuery(since: number): string {
  return since > 0 ? `sinceSequence=${since}` : "";
}

/**
 * SSE line parsing: split a buffered SSE payload into `data:` lines.
 * Handles `\n\n` framing; multi-line `data:` values are joined per the SSE
 * spec (each line after `data:` appends with a newline).
 */
export function extractSseDataLines(buffer: string): string[] {
  const frames = buffer.split(/\r?\n\r?\n/);
  const dataLines: string[] = [];
  for (const frame of frames) {
    const lines = frame.split(/\r?\n/);
    const data: string[] = [];
    for (const line of lines) {
      if (line.startsWith("data:")) {
        data.push(line.slice(5).replace(/^ /, ""));
      } else if (line.startsWith(":")) {
        // SSE comment (heartbeat) — ignore.
        continue;
      }
    }
    if (data.length > 0) dataLines.push(data.join("\n"));
  }
  return dataLines;
}
