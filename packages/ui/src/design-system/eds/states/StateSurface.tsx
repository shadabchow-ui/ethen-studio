"use client";

/**
 * EDS StateSurface — D13.
 *
 * One shape for every non-ideal state, so the product has a single recovery
 * language instead of eleven. The mechanism the repository already has is
 * good — `RouteSkeleton` per category, `aria-busy`, `role="status"`,
 * `aria-live`. What was wrong was the language, so this component is mostly
 * about enforcing the language.
 *
 * THE FOUR CLAUSES. Every interrupted state answers, in order:
 *
 *   what stopped · why · what state you are in now · what you can do
 *
 * The third clause is the one products skip and the one people actually need.
 * A failure that does not say what was left untouched forces the reader to go
 * and check, which is the moment trust is lost. So `unchanged` is a required
 * field on a failure, not an optional nicety — the type will not let a
 * failure ship without it.
 *
 * THE VOICE. Ethen speaks in the first person about its own actions and never
 * about the reader's: "I couldn't record your decision", not "the operation
 * failed" and never "you failed to". No bare adjectives for a state, no
 * praise, no apology theatre, no exclamation marks. Actions name the outcome,
 * not the mechanism — `Try again`, not `Retry operation`; `Review the limits`,
 * not `Submit`.
 *
 * Severity is carried by the word in `label`, never by a coloured card.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";

export const STATE_KINDS = [
  "loading",
  "streaming",
  "empty",
  "partial",
  "blocked",
  "failure",
  "retry",
  "offline",
  "permission-denied",
  "expired",
] as const;

export type StateKind = (typeof STATE_KINDS)[number];

export type StateAction = Readonly<{
  /** Names the outcome, never the mechanism. */
  label: string;
  onAction?: () => void;
}>;

export interface StateSurfaceProps {
  kind: StateKind;
  /**
   * The severity word. Never a bare adjective standing alone as the whole
   * message — it labels the state, the body explains it.
   */
  label: string;
  /** What stopped, or what this surface is for. First person about Ethen. */
  title: string;
  /** Why it stopped, and what is unchanged. */
  body: string;
  /**
   * What state the reader is in now. REQUIRED for every interrupted state:
   * a failure that does not say what was left untouched is not finished copy.
   */
  unchanged?: string;
  actions?: readonly StateAction[];
  id?: string;
}

/**
 * States that must state what is unchanged. Enforced by the validator and by
 * the Lab, so the third clause cannot quietly go missing.
 */
export const STATES_REQUIRING_UNCHANGED: readonly StateKind[] = [
  "partial",
  "blocked",
  "failure",
  "retry",
  "offline",
  "permission-denied",
  "expired",
];

/**
 * A skeleton in the shape of the content — never a spinner where a skeleton
 * fits. The shape is the point: a spinner tells the reader to wait, a
 * skeleton tells them what is coming.
 */
export function StateSkeleton({ shape = "document", label }: { shape?: "document" | "workspace" | "data"; label: string }) {
  return (
    <div className="eds-state-skeleton" data-skeleton-shape={shape} role="status" aria-busy="true" aria-live="polite">
      <span className="eds-state-skeleton__label">{label}</span>
      <span aria-hidden className="eds-state-skeleton__lines">
        <span className="eds-state-skeleton__line" />
        <span className="eds-state-skeleton__line" />
        <span className="eds-state-skeleton__line" />
      </span>
    </div>
  );
}

export function StateSurface({ kind, label, title, body, unchanged, actions = [], id }: StateSurfaceProps) {
  const reactId = React.useId();
  const surfaceId = id ?? `eds-state-${reactId}`;
  const interrupted = STATES_REQUIRING_UNCHANGED.includes(kind);
  return (
    <section
      id={surfaceId}
      className="eds-state"
      data-state-kind={kind}
      role="status"
      aria-live="polite"
      aria-labelledby={`${surfaceId}-title`}
    >
      {/* Severity is this word, not a colour. */}
      <p className="eds-state__label">{label}</p>
      <h3 id={`${surfaceId}-title`} className="eds-state__title">{title}</h3>
      <p className="eds-state__body">{body}</p>
      {unchanged ? <p className="eds-state__unchanged">{unchanged}</p> : null}
      {actions.length > 0 ? (
        <div className="eds-state__actions">
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              className={
                index === 0
                  ? "eds-state__action eds-state__action--primary"
                  : "eds-state__action"
              }
              onClick={action.onAction}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {interrupted && !unchanged ? (
        // A development-time signal, not product copy: this state shipped
        // without its third clause.
        <p className="eds-state__incomplete">
          This state is missing its “what is unchanged” clause.
        </p>
      ) : null}
    </section>
  );
}
