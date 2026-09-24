"use client";

/**
 * EDS AutonomySentence — D12 signature component.
 *
 * What Ethen may do on its own, as a sentence a person can read:
 *
 *   "Production needs your approval"
 *
 * This is the human-readable face of the capability gates that already exist
 * in lib/portfolio/founder-guard.ts. It reads that shape — it does not define
 * a second permission system, and it cannot grant anything. A component that
 * described capabilities it did not source from the real gate would be a
 * second source of truth about what the agent is allowed to do, which is the
 * one place a design system must never improvise.
 *
 * State is carried by the sentence itself plus a glyph, never by colour, so
 * "needs your approval" and "runs on its own" stay distinguishable in
 * forced-colors and to a colour-blind reader.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";
import type { FounderCapabilityGate, FounderCapabilitySwitchId } from "@ethen/contracts/portfolio/founder-capability";

/**
 * The human phrasing for each real capability switch. Keyed by the actual
 * FounderCapabilitySwitchId union, so a switch added to the gate without a
 * sentence here is a compile error rather than a silently missing row.
 */
export const CAPABILITY_SUBJECT: Record<FounderCapabilitySwitchId, string> = {
  orchestrator_execution: "Running work end to end",
  external_communications: "Sending messages on your behalf",
  spending: "Spending money",
  // Named for the boundary a reader recognises, not the mechanism: this is
  // the switch that gates production, and "Production needs your approval"
  // is the sentence the product is built around.
  code_deploy: "Production",
  publishing: "Publishing",
  connector_writes: "Writing to connected accounts",
};

/**
 * The two state marks. Text-presentation geometry, never an emoji: a colour
 * emoji cannot inherit `currentColor`, so it would keep its own hue in dark
 * mode and survive `forced-colors` unchanged while every other mark around it
 * adapted. The vocabulary is the one the rest of the system already uses --
 * an arrow for work that continues on its own, and the same filled square the
 * Lab uses for "waiting on a human decision", which is exactly what an
 * approval gate is.
 */
export const AUTONOMY_GLYPH = {
  /** Runs on its own -- the work continues without you. */
  autonomous: "\u2192",
  /** Needs your approval -- the work stops here until you decide. */
  gated: "\u25a0",
} as const;

export interface AutonomySentenceProps {
  /** Gates from the real capability authority. */
  gates: readonly FounderCapabilityGate[];
  id?: string;
}

/**
 * One gate, one sentence. An enabled gate reads as autonomy; a disabled gate
 * reads as a request for approval, which is the canonical example:
 * "Production needs your approval".
 */
export function autonomySentence(gate: FounderCapabilityGate): string {
  const subject = CAPABILITY_SUBJECT[gate.id];
  return gate.enabled ? `${subject} runs on its own` : `${subject} needs your approval`;
}

export function AutonomySentence({ gates, id }: AutonomySentenceProps) {
  const reactId = React.useId();
  const listId = id ?? `eds-autonomy-${reactId}`;
  return (
    <ul id={listId} className="eds-autonomy" aria-label="What Ethen may do on its own">
      {gates.map((gate) => (
        <li key={gate.id} className="eds-autonomy__row" data-capability={gate.id} data-enabled={gate.enabled ? "true" : "false"}>
          <span aria-hidden className="eds-autonomy__glyph">{gate.enabled ? AUTONOMY_GLYPH.autonomous : AUTONOMY_GLYPH.gated}</span>
          <span className="eds-autonomy__sentence">{autonomySentence(gate)}</span>
          {gate.reason && gate.reason !== autonomySentence(gate) ? (
            <span className="eds-autonomy__reason">{gate.reason}</span>
          ) : null}
          <span className="eds-autonomy__source">set by {gate.source}</span>
        </li>
      ))}
    </ul>
  );
}
