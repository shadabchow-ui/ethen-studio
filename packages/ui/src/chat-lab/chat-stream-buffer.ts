/**
 * CHAT_A2_2 — stream update batching.
 *
 * First useful content flushes immediately (no artificial typing delay).
 * Steady arrivals are batched on a short trailing window so the UI does not
 * perform one React-wide update per token. No decorative animation involved.
 *
 * `STREAM_BATCH_WINDOW_MS` (30ms) sits inside the job's 25–40ms band. The
 * scheduler is injectable so focused tests can drive it deterministically.
 */

export const STREAM_BATCH_WINDOW_MS = 30;

export type StreamFlush = (runId: string, text: string) => void;

export type StreamScheduler = Readonly<{
  schedule: (fn: () => void, ms: number) => unknown;
  cancel: (handle: unknown) => void;
}>;

const defaultScheduler: StreamScheduler = {
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

type PendingRun = { latest: string; timer: unknown; flushedOnce: boolean };

export class ChatStreamBuffer {
  private readonly pending = new Map<string, PendingRun>();

  constructor(
    private readonly flush: StreamFlush,
    private readonly scheduler: StreamScheduler = defaultScheduler,
    private readonly windowMs: number = STREAM_BATCH_WINDOW_MS,
  ) {}

  /** Push cumulative text for a run. First push flushes synchronously. */
  push(runId: string, text: string): void {
    const existing = this.pending.get(runId);
    if (!existing || !existing.flushedOnce) {
      if (existing) this.scheduler.cancel(existing.timer);
      this.pending.set(runId, { latest: text, timer: null, flushedOnce: true });
      this.flush(runId, text);
      return;
    }
    existing.latest = text;
    if (existing.timer === null) {
      existing.timer = this.scheduler.schedule(() => {
        const current = this.pending.get(runId);
        if (!current) return;
        current.timer = null;
        this.flush(runId, current.latest);
      }, this.windowMs);
    }
  }

  /**
   * CHAT_A5.1 — emit any coalesced text now, then forget the run. Called on
   * the terminal paths (completion, Stop, failure) and before a chat switch,
   * so the map never retains one entry per historic run.
   */
  flushRun(runId: string): void {
    const existing = this.pending.get(runId);
    if (!existing) return;
    if (existing.timer !== null) {
      this.scheduler.cancel(existing.timer);
      this.flush(runId, existing.latest);
    }
    this.pending.delete(runId);
  }

  /** Forget a run without emitting (run superseded before first flush — unreachable in practice). */
  dropRun(runId: string): void {
    const existing = this.pending.get(runId);
    if (!existing) return;
    if (existing.timer !== null) this.scheduler.cancel(existing.timer);
    this.pending.delete(runId);
  }

  pendingCount(): number {
    return this.pending.size;
  }
}
