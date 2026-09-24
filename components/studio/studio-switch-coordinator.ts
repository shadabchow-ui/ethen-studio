/**
 * Studio V3 Job 4 — six-surface stale-response coordinator.
 *
 * Extends LatestRequestGate ownership from Assets to model/project/asset/
 * generation/reference/panel switches: one gate per surface, so a late
 * response for A never commits after the user selected B on ANY surface.
 * Framework-free; the React hook (`useStudioSwitches`) owns one instance
 * per mounted workspace and clears it on unmount.
 */

import { LatestRequestGate, type RequestTicket } from "@ethen/app-shell/latest-request-gate";

export type StudioSwitchSurface = "model" | "project" | "asset" | "generation" | "reference" | "panel";

export const STUDIO_SWITCH_SURFACES: readonly StudioSwitchSurface[] = [
  "model",
  "project",
  "asset",
  "generation",
  "reference",
  "panel",
];

export function assertSwitchSurface(value: string): StudioSwitchSurface {
  if ((STUDIO_SWITCH_SURFACES as readonly string[]).includes(value)) return value as StudioSwitchSurface;
  throw new Error(`STUDIO_SURFACE_UNKNOWN: ${value} is not a guarded switch surface.`);
}

export class StudioSwitchCoordinator {
  private readonly gates = new Map<StudioSwitchSurface, LatestRequestGate>();

  private gateFor(surface: StudioSwitchSurface): LatestRequestGate {
    let gate = this.gates.get(surface);
    if (!gate) {
      gate = new LatestRequestGate();
      this.gates.set(surface, gate);
    }
    return gate;
  }

  /** Issue the current request for an identity on a surface (aborts superseded). */
  issue(surface: StudioSwitchSurface, identity: string): RequestTicket {
    return this.gateFor(surface).issue(identity);
  }

  /** True only when the ticket is still the newest for its surface + identity. */
  isCurrent(surface: StudioSwitchSurface, ticket: RequestTicket): boolean {
    return this.gateFor(surface).isCurrent(ticket);
  }

  /** Run `commit` only when the ticket is still current. Returns commit ran. */
  commitIfCurrent(surface: StudioSwitchSurface, ticket: RequestTicket, commit: () => void): boolean {
    return this.gateFor(surface).commitIfCurrent(ticket, commit);
  }

  /** Clear one surface (abort in flight, invalidate tickets). */
  clearSurface(surface: StudioSwitchSurface): void {
    this.gateFor(surface).clear();
  }

  /** Clear all six surfaces (unmount / workspace teardown). */
  clearAll(): void {
    for (const surface of STUDIO_SWITCH_SURFACES) this.gateFor(surface).clear();
  }
}
