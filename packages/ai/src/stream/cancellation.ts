/**
 * FJ-11 — Idempotent stream cancellation + stop/retry/regenerate guards.
 *
 * Guarantees:
 *   - Cancellation is idempotent: the first `cancel()` wins; later calls
 *     report `{ first: false }` and do NOT re-emit external actions.
 *   - stop / retry / regenerate cannot duplicate persisted messages:
 *     each generation carries a distinct `generationId`; cancellation and
 *     completion are recorded per generation, so a retry never re-persists
 *     the previous generation's messages.
 *   - Terminal state is sticky: after completion/cancellation, further
 *     cancels are no-ops.
 *
 * Pure + testable in the node environment (no DOM).
 */

export type StreamTerminalState = "live" | "completed" | "cancelled" | "failed";

export interface CancelRequestResult {
  /** True when THIS call performed the cancellation (idempotency anchor). */
  first: boolean;
  generationId: number;
  state: StreamTerminalState;
}

export interface GenerationOutcome {
  generationId: number;
  terminal: StreamTerminalState;
  /** True when the generation ended with a persisted message (or would). */
  persisted: boolean;
}

export class StreamCancellation {
  private generation = 0;
  private terminal: StreamTerminalState = "live";
  private cancelledGenerations = new Set<number>();
  private lastCancelReason: "user_stop" | "timeout" | "client_disconnect" | "server_abort" | null = null;

  /** Current generation id. Starts at 0; retry/regenerate bump it. */
  get generationId(): number {
    return this.generation;
  }

  get state(): StreamTerminalState {
    return this.terminal;
  }

  /** Reason recorded by the first (winning) cancellation, if any. */
  get cancelReason(): "user_stop" | "timeout" | "client_disconnect" | "server_abort" | null {
    return this.lastCancelReason;
  }

  /**
   * Request cancellation of the CURRENT generation. Idempotent: only the
   * first call for a generation returns `first: true`. If the stream is
   * already terminal (completed/cancelled/failed), this is a no-op.
   */
  cancel(
    reason: "user_stop" | "timeout" | "client_disconnect" | "server_abort" = "user_stop",
  ): CancelRequestResult {
    if (this.terminal !== "live") {
      return { first: false, generationId: this.generation, state: this.terminal };
    }
    const first = !this.cancelledGenerations.has(this.generation);
    this.cancelledGenerations.add(this.generation);
    if (first) {
      this.terminal = "cancelled";
      this.lastCancelReason = reason;
    }
    return { first, generationId: this.generation, state: this.terminal };
  }

  /** Mark the current generation completed (sticky terminal state). */
  complete(): GenerationOutcome {
    this.terminal = "completed";
    this.cancelledGenerations.delete(this.generation);
    return { generationId: this.generation, terminal: "completed", persisted: true };
  }

  /** Mark the current generation failed (sticky; retry is still allowed). */
  fail(): GenerationOutcome {
    this.terminal = "failed";
    return { generationId: this.generation, terminal: "failed", persisted: false };
  }

  /**
   * Start a new generation (retry or regenerate). Bumps the generation id
   * and resets the terminal state to live. Persisted messages from previous
   * generations are untouched — the caller persists only under the new id.
   */
  nextGeneration(): GenerationOutcome {
    this.generation += 1;
    this.terminal = "live";
    return { generationId: this.generation, terminal: "live", persisted: false };
  }

  /**
   * Whether the given generation was cancelled. Used by persistence paths
   * to refuse writing a cancelled generation's partial output.
   */
  wasCancelled(generationId: number): boolean {
    return this.cancelledGenerations.has(generationId);
  }

  /** True while the current generation is cancellable (live). */
  get cancellable(): boolean {
    return this.terminal === "live";
  }
}

/**
 * Convenience factory for ephemeral (non-persistent) consumers.
 */
export function createStreamCancellation(): StreamCancellation {
  return new StreamCancellation();
}
