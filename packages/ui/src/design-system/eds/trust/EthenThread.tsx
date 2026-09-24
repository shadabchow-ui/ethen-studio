"use client";

/**
 * EDS EthenThread — D12 signature component.
 *
 * Ethen's execution model made visible. Eight stages, in order:
 *
 *   Intent · Context · Authority · Execution · Evidence ·
 *   Outcome · Judgement · Ground truth
 *
 * The last three do not exist in the platform today. They are rendered as
 * unreached — dotted connector, outlined node — because drawing them honestly
 * is the point: it shows the reader where the record actually stops, and it
 * keeps the missing half of the architecture visible to the team. Nothing
 * here may report a stage as reached that the caller has not evidenced.
 *
 * This component renders real execution state and appears nowhere else. It is
 * not a spinner, not an empty state, not a divider, not decoration. The
 * moment the Thread appears where there is no execution to describe, it stops
 * meaning anything.
 *
 * Two forms, one model: `vertical` for live task progress in the workspace,
 * `horizontal` for a complete Thread on a receipt.
 *
 * Reduced motion: the Thread is drawn, never animated, in every case — there
 * is no advancing animation to suppress.
 *
 * A11y: the visual line is decorative; the ordered list carries the meaning,
 * and every node states its stage, its state, and its detail in text. The
 * complete textual equivalent is what a screen reader receives, so the Thread
 * is never a picture the reader has to take on trust.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";

export const THREAD_STAGES = [
  "Intent",
  "Context",
  "Authority",
  "Execution",
  "Evidence",
  "Outcome",
  "Judgement",
  "Ground truth",
] as const;

export type ThreadStage = (typeof THREAD_STAGES)[number];

/**
 * Stages the platform has no record type for. A caller cannot mark these
 * reached — the component refuses, because a reached Ground truth node would
 * be a claim the backend cannot support.
 */
export const UNSUPPORTED_THREAD_STAGES: readonly ThreadStage[] = ["Outcome", "Judgement", "Ground truth"];

export type ThreadNodeState = "reached" | "current" | "unreached";

export type ThreadNode = Readonly<{
  stage: ThreadStage;
  state: ThreadNodeState;
  /** Plain-language detail for this stage. Omitted when there is nothing true to say. */
  detail?: string;
}>;

const STATE_TEXT: Record<ThreadNodeState, string> = {
  reached: "done",
  current: "in progress",
  unreached: "not reached",
};

/**
 * Enforce the honesty rule in the component, not in a comment: a stage the
 * platform cannot record is always rendered unreached, whatever the caller
 * passed. This is the one place the rule can be applied for every consumer.
 */
export function reconcileThreadNodes(nodes: readonly ThreadNode[]): readonly ThreadNode[] {
  return nodes.map((node) =>
    UNSUPPORTED_THREAD_STAGES.includes(node.stage) && node.state !== "unreached"
      ? { ...node, state: "unreached" as const, detail: undefined }
      : node,
  );
}

export interface EthenThreadProps {
  nodes: readonly ThreadNode[];
  orientation?: "vertical" | "horizontal";
  /** Names what this Thread describes, e.g. "Deployment fix". */
  label: string;
  id?: string;
}

export function EthenThread({ nodes, orientation = "vertical", label, id }: EthenThreadProps) {
  const reconciled = reconcileThreadNodes(nodes);
  const reachedCount = reconciled.filter((node) => node.state === "reached").length;
  const current = reconciled.find((node) => node.state === "current");

  return (
    <div
      id={id}
      className={`eds-thread eds-thread--${orientation}`}
      data-thread-orientation={orientation}
    >
      {/* The one-line equivalent a screen reader hears before the stages. */}
      <p className="eds-thread__summary">
        {label}: {reachedCount} of {reconciled.length} stages complete
        {current ? `, currently ${current.stage.toLowerCase()}` : ""}.
      </p>
      <ol className="eds-thread__nodes" aria-label={`${label} execution thread`}>
        {reconciled.map((node) => (
          <li
            key={node.stage}
            className="eds-thread__node"
            data-thread-stage={node.stage}
            data-thread-state={node.state}
          >
            <span aria-hidden className="eds-thread__marker">
              <span className="eds-thread__dot" />
              <span className="eds-thread__line" />
            </span>
            <span className="eds-thread__body">
              <span className="eds-thread__stage">{node.stage}</span>
              <span className="eds-thread__state">{STATE_TEXT[node.state]}</span>
              {/* The horizontal receipt form is complete in STAGES, not in
                  per-stage detail: eight nodes of prose wrap into an
                  unreadable block. The facts live in the receipt rows, and
                  the summary above still carries the full text equivalent. */}
              {node.detail && orientation === "vertical" ? (
                <span className="eds-thread__detail">{node.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
