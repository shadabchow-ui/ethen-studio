"use client";

/**
 * EDS LedgerReceipt — D12 signature component.
 *
 * A restrained certificate, not a dashboard card. It is the artefact a person
 * keeps, forwards, or shows to an auditor, so it reads top to bottom in one
 * column: serif headline, plain-language rows, hairline rules, mono for the
 * hashes and identifiers that are machine facts. No tiles, no charts, no
 * two-column dashboard grid — a receipt that looks like a dashboard invites
 * skimming, and this is a document meant to be read.
 *
 * Screen-reader order is the reading order. The rows are a definition list
 * and the Thread carries its own text equivalent, so nothing about the
 * receipt depends on seeing where an element sits on the page.
 *
 * `Verify receipt` is a REAL action: it runs the caller's verification, which
 * production backs with `verifyAuditChain()` over the audit entries. It is
 * offered only when a verifier is supplied — a verify button that cannot
 * verify would be exactly the kind of reassurance this component exists to
 * refuse.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";
import { EthenThread, type ThreadNode } from "./EthenThread";

export type ReceiptRow = Readonly<{
  term: string;
  value: string;
  /** Machine facts render mono; prose does not. */
  mono?: boolean;
}>;

export type ReceiptVerification =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "valid"; detail?: string }
  | { state: "invalid"; reason: string };

export interface LedgerReceiptProps {
  headline: string;
  /** One sentence saying what this receipt is a record of. */
  summary: string;
  rows: readonly ReceiptRow[];
  /** The complete Thread for the run this receipt records. */
  thread?: readonly ThreadNode[];
  threadLabel?: string;
  /**
   * Runs the real verification. Omit when no verifier is available for this
   * record; the control is then not rendered at all.
   */
  onVerify?: () => Promise<ReceiptVerification> | ReceiptVerification;
  id?: string;
}

export function LedgerReceipt({
  headline,
  summary,
  rows,
  thread,
  threadLabel = "Run",
  onVerify,
  id,
}: LedgerReceiptProps) {
  const reactId = React.useId();
  const receiptId = id ?? `eds-receipt-${reactId}`;
  const [verification, setVerification] = React.useState<ReceiptVerification>({ state: "idle" });

  async function verify() {
    if (!onVerify) return;
    setVerification({ state: "checking" });
    try {
      setVerification(await onVerify());
    } catch (error) {
      setVerification({ state: "invalid", reason: error instanceof Error ? error.message : "Verification could not complete." });
    }
  }

  return (
    <article id={receiptId} className="eds-receipt" aria-labelledby={`${receiptId}-headline`}>
      <header className="eds-receipt__head">
        <h3 id={`${receiptId}-headline`} className="eds-receipt__headline">{headline}</h3>
        <p className="eds-receipt__summary">{summary}</p>
      </header>

      <dl className="eds-receipt__rows">
        {rows.map((row) => (
          <div key={row.term} className="eds-receipt__row">
            <dt className="eds-receipt__term">{row.term}</dt>
            <dd className={row.mono ? "eds-receipt__value eds-receipt__value--mono" : "eds-receipt__value"}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {thread && thread.length > 0 ? (
        <section className="eds-receipt__thread" aria-label={`${threadLabel} thread`}>
          <EthenThread nodes={thread} orientation="horizontal" label={threadLabel} id={`${receiptId}-thread`} />
        </section>
      ) : null}

      {onVerify ? (
        <footer className="eds-receipt__verify">
          <button
            type="button"
            className="eds-receipt__verify-action"
            onClick={verify}
            disabled={verification.state === "checking"}
          >
            {verification.state === "checking" ? "Verifying…" : "Verify receipt"}
          </button>
          <p className="eds-receipt__verify-result" role="status" data-verification={verification.state}>
            {verification.state === "idle"
              ? "Not verified in this session."
              : verification.state === "checking"
                ? "Re-computing the hash chain."
                : verification.state === "valid"
                  ? `Chain intact.${verification.detail ? ` ${verification.detail}` : ""}`
                  : `Chain does not verify. ${verification.reason}`}
          </p>
        </footer>
      ) : null}
    </article>
  );
}
