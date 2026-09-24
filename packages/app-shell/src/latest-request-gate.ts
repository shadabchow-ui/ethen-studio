/**
 * Latest-request gate: exactly one asynchronous request is current.
 *
 * Remediation Pass 1 (audit F3/F7): a response for project/document A must
 * never commit after the user selected B (or cleared the selection).
 * Issuing a new request aborts all superseded ones; commits validate both
 * the generation and the selected identity before touching state.
 *
 * Framework-free so the same gate guards Studio assets, Designer
 * documents, and any future selection-driven fetch.
 */

export interface RequestTicket {
  /** Monotonic generation; only the newest generation may commit. */
  generation: number;
  /** Identity the request was issued for (project/document id). */
  identity: string;
  /** Aborted when superseded, cleared, or reset. */
  signal: AbortSignal;
}

export class LatestRequestGate {
  private generation = 0;
  private currentIdentity: string | null = null;
  private live = new Map<number, AbortController>();

  /**
   * Issue the (only) current request for `identity`. Aborts every
   * previously issued request. Returns its ticket for commit validation.
   */
  issue(identity: string): RequestTicket {
    for (const [, controller] of this.live) controller.abort();
    this.live.clear();
    this.generation += 1;
    this.currentIdentity = identity;
    const controller = new AbortController();
    this.live.set(this.generation, controller);
    return { generation: this.generation, identity, signal: controller.signal };
  }

  /**
   * Clear the selection (or unmount): abort everything in flight and make
   * every outstanding ticket stale so late responses commit nothing.
   */
  clear(): void {
    for (const [, controller] of this.live) controller.abort();
    this.live.clear();
    this.generation += 1;
    this.currentIdentity = null;
  }

  /** True only when the ticket is the newest generation for the selection. */
  isCurrent(ticket: RequestTicket): boolean {
    return ticket.generation === this.generation && ticket.identity === this.currentIdentity;
  }

  /**
   * Run `commit` only when the ticket is still current. Returns true when
   * the commit ran. Use for every state write fed by an async response.
   */
  commitIfCurrent(ticket: RequestTicket, commit: () => void): boolean {
    if (!this.isCurrent(ticket)) return false;
    commit();
    return true;
  }
}
