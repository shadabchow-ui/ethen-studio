"use client";

/**
 * EDS EvidenceAffordance — D11 canonical (G7 remediation).
 *
 * The persistent Evidence trigger for every presentation that is not the
 * persistent rail. It is a control, not a layout participant: EvidenceHost
 * hands it to the Work surface, which places it in its own header. It never
 * becomes a sibling column of Work, so it can never compress the Workspace.
 *
 * The label carries the highest-signal truthful summary (for example
 * "3 checks · 2 sources"); cost appears only when a real contract carries it.
 * The dialog it opens — overlay at 1024–1279, sheet below 1024 — is owned by
 * EvidenceHost, which is also where the useOverlay focus contract lives
 * (trap, Escape close, focus restore, forced-colors safe). One dialog, one
 * trap, one rail.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";

export interface EvidenceAffordanceProps {
  summary: string;
  label?: string;
  open: boolean;
  onOpen: () => void;
}

export const EvidenceAffordance = React.forwardRef<HTMLButtonElement, EvidenceAffordanceProps>(
  function EvidenceAffordance({ summary, label = "Evidence", open, onOpen }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className="eds-evidence__affordance"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onOpen}
      >
        <span className="eds-evidence__affordance-label">{label}</span>
        <span className="eds-evidence__affordance-summary">{summary}</span>
      </button>
    );
  },
);
