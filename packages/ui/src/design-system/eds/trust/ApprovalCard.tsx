"use client";

/**
 * EDS ApprovalCard — D12 signature component.
 *
 * The screen where a person takes responsibility for something an agent is
 * about to do. Every decision in its design follows from that:
 *
 * - No coloured header band, no shadow, radius 12, a `rule-control` border.
 *   The card is a document to be read, not a notification to be dismissed.
 * - The verdict line is serif. It is the one sentence that says what will
 *   happen, and it is the only place in the card where type raises its voice.
 * - Facts are a mono definition list. Provenance reads as machine record;
 *   the reasoning around it reads as prose. A reader can tell at a glance
 *   which is which.
 * - Risk is a WORD, plus a restrained leading Brick rule on high risk only.
 *   Risk never depends on colour: remove all colour and the card still says
 *   "Destructive". Forced-colors and colour-blind readers lose nothing.
 * - `Don't allow` is leftmost and quiet. The safe choice must not be styled
 *   as the reluctant one, and it must not be an aggressive red that makes
 *   refusing feel like an error.
 * - An irreversible action replaces the `Reversible` line with a Brick
 *   warning and requires typed confirmation. Nothing about that flow is
 *   decorative: the phrase must be typed exactly before Approve enables.
 * - Details expand at the `deliberate` motion token, because consequence
 *   should not feel instant.
 *
 * Two actions ship, because two actions exist: `Don't allow` and
 * `Approve once`. `Edit limits` and `Approve for this task` are rendered as
 * marked dependency targets — standing grants and attenuation have no backend
 * — never as controls that would silently do nothing. Cost and authority are
 * absent from the contract and are absent here; no placeholder currency, no
 * invented approver chain.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";
import type { ApprovalRiskLabel } from "@ethen/contracts/approvals/types";
import { RISK_LABEL_TEXT } from "@ethen/contracts/approvals/types";
import { DependencyTarget } from "./Dependency";

/**
 * Risk labels that warrant the leading Brick rule. Derived from the real
 * ApprovalRiskLabel union so a new backend risk level cannot silently fall
 * through as "not consequential".
 */
export const CONSEQUENTIAL_RISK_LABELS: readonly ApprovalRiskLabel[] = [
  "destructive",
  "privileged",
  "external_effect",
];

export function isConsequential(risk: ApprovalRiskLabel): boolean {
  return CONSEQUENTIAL_RISK_LABELS.includes(risk);
}

export type ApprovalFact = Readonly<{
  /** Plain-language term, e.g. "Repository". */
  term: string;
  /** The value. Machine facts render mono. */
  value: string;
  /** False for prose values such as a rationale sentence. */
  mono?: boolean;
}>;

export interface ApprovalCardProps {
  /** What is being asked, in plain language. */
  title: string;
  /**
   * The verdict line: one sentence naming exactly what will happen if the
   * reader approves. Serif, and the only raised voice in the card.
   */
  verdict: string;
  riskLabel: ApprovalRiskLabel;
  /** Provenance and parameters, as a mono definition list. */
  facts: readonly ApprovalFact[];
  /** Why the agent is asking. Prose. */
  rationale?: string;
  /** What the reader gets back if this goes wrong. */
  rollbackPath?: string | null;
  /**
   * True when the action cannot be undone. Replaces the Reversible line with
   * a Brick warning and requires typed confirmation.
   */
  irreversible?: boolean;
  /** The exact phrase the reader must type to enable Approve. */
  confirmationPhrase?: string;
  /** Expanded detail, revealed with the deliberate motion token. */
  details?: React.ReactNode;
  expiresAt?: string | null;
  /** Absent when the entry cannot be decided (expired, sample, terminal). */
  onApprove?: () => void;
  onDeny?: () => void;
  /** Why the actions are unavailable, when they are. */
  unavailableReason?: string;
  busy?: boolean;
  /**
   * Render the marked future capabilities (Edit limits, Approve for this task)
   * as inert dependency targets.
   *
   * Off by default, because "DEPENDS ON: V7" is programme language, not
   * product language: on a real approval it puts two dead controls and an
   * internal system name in front of someone deciding whether to let an agent
   * touch production. The marker exists so the Lab shows the gap every time it
   * is opened -- that is a review affordance, and the Lab is where it belongs.
   * The milestone contract is the same in both directions: the Lab marks the
   * dependency, the production port ships the subset that is real.
   */
  showDependencies?: boolean;
  id?: string;
}

export function ApprovalCard({
  title,
  verdict,
  riskLabel,
  facts,
  rationale,
  rollbackPath,
  irreversible = false,
  confirmationPhrase,
  details,
  expiresAt,
  onApprove,
  onDeny,
  unavailableReason,
  busy = false,
  showDependencies = false,
  id,
}: ApprovalCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const reactId = React.useId();
  const cardId = id ?? `eds-approval-${reactId}`;
  const detailsId = `${cardId}-details`;
  const confirmId = `${cardId}-confirm`;

  const phrase = irreversible ? (confirmationPhrase ?? "approve") : null;
  const confirmed = phrase === null || typed.trim() === phrase;
  const decidable = !!onApprove && !!onDeny;
  const approveDisabled = busy || !confirmed;

  return (
    <section
      id={cardId}
      className="eds-approval"
      data-risk={riskLabel}
      data-consequential={isConsequential(riskLabel) ? "true" : "false"}
      data-irreversible={irreversible ? "true" : "false"}
      aria-labelledby={`${cardId}-title`}
    >
      {/* Leading rule for consequential risk. Decorative — the risk word below
          carries the meaning, so nothing is lost without colour. */}
      {isConsequential(riskLabel) ? <div aria-hidden className="eds-approval__risk-rule" /> : null}

      <header className="eds-approval__head">
        <h3 id={`${cardId}-title`} className="eds-approval__title">{title}</h3>
        <p className="eds-approval__risk">
          <span className="eds-approval__risk-label">Risk</span>
          <span className="eds-approval__risk-word">{RISK_LABEL_TEXT[riskLabel]}</span>
        </p>
      </header>

      <p className="eds-approval__verdict">{verdict}</p>

      {rationale ? <p className="eds-approval__rationale">{rationale}</p> : null}

      <dl className="eds-approval__facts">
        {facts.map((fact) => (
          <div key={fact.term} className="eds-approval__fact">
            <dt className="eds-approval__term">{fact.term}</dt>
            <dd className={fact.mono === false ? "eds-approval__value" : "eds-approval__value eds-approval__value--mono"}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Reversibility. An irreversible action does not get a reassuring
          "Reversible" line with a caveat; it gets a warning instead. */}
      {irreversible ? (
        <p className="eds-approval__irreversible">
          <span aria-hidden className="eds-approval__irreversible-rule" />
          This cannot be undone.
          {rollbackPath ? ` ${rollbackPath}` : " There is no rollback path for this action."}
        </p>
      ) : rollbackPath ? (
        <p className="eds-approval__reversible">
          <span className="eds-approval__reversible-label">Reversible</span> {rollbackPath}
        </p>
      ) : null}

      {expiresAt ? (
        <p className="eds-approval__expiry">
          Expires <span className="eds-approval__value--mono">{expiresAt}</span>
        </p>
      ) : null}

      {details ? (
        <div className="eds-approval__details">
          <button
            type="button"
            className="eds-approval__disclosure"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
          <div id={detailsId} className="eds-approval__details-body" hidden={!expanded}>
            {details}
          </div>
        </div>
      ) : null}

      {irreversible && decidable ? (
        <div className="eds-approval__confirm">
          <label htmlFor={confirmId} className="eds-approval__confirm-label">
            Type <span className="eds-approval__value--mono">{phrase}</span> to confirm
          </label>
          <input
            id={confirmId}
            className="eds-approval__confirm-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-describedby={`${cardId}-confirm-help`}
          />
          <p id={`${cardId}-confirm-help`} className="eds-approval__confirm-help" role="status">
            {confirmed ? "Confirmed. Approve is now available." : "Approve stays unavailable until the phrase matches."}
          </p>
        </div>
      ) : null}

      <footer className="eds-approval__actions">
        {decidable ? (
          <>
            {/* Leftmost, quiet, and never red: refusing is not an error. */}
            <button type="button" className="eds-approval__action eds-approval__action--deny" onClick={onDeny} disabled={busy}>
              Don&rsquo;t allow
            </button>
            <button
              type="button"
              className="eds-approval__action eds-approval__action--approve"
              onClick={onApprove}
              disabled={approveDisabled}
              aria-describedby={irreversible && !confirmed ? `${cardId}-confirm-help` : undefined}
            >
              Approve once
            </button>
          </>
        ) : (
          <p className="eds-approval__unavailable" role="status">
            {unavailableReason ?? "This approval can no longer be decided."}
          </p>
        )}
        {showDependencies ? (
          <span className="eds-approval__future">
            <DependencyTarget label="Edit limits" dependsOn="V7" note="attenuation is not in the approval contract" />
            <DependencyTarget label="Approve for this task" dependsOn="V7" note="standing grants are not in the approval contract" />
          </span>
        ) : null}
      </footer>
    </section>
  );
}
