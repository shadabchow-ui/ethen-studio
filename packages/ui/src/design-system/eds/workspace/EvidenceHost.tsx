"use client";

/**
 * EDS EvidenceHost — D11 canonical (G7 remediation).
 *
 * One responsive evidence architecture for INTENT · WORK · EVIDENCE. The SAME
 * EvidenceRail is wired at every breakpoint; only its presentation changes,
 * and the live presentation is resolved from the SAME media queries the
 * stylesheet uses, so the DOM never claims a presentation the viewer is not
 * seeing:
 *
 * - Wide (>=1600):     persistent rail, 404px third column.
 * - Desktop (1280–1599): persistent rail, 320px third column.
 * - Laptop (1024–1279): right-side overlay over the Workspace.
 * - Tablet/phone (<1024): bottom sheet.
 *
 * STRUCTURAL WIDTH CONTRACT — below 1280 the host renders NO second child in
 * the Workspace row. The work surface owns 100% of the horizontal space and
 * the persistent Evidence affordance is handed to the work surface to place
 * in its own header (the `work` render prop receives it). The affordance is
 * never a sibling flex column, so it cannot compress Work at any width.
 *
 * TRANSITION SAFETY — the open overlay/sheet is owned by presentation. When
 * the viewport crosses into a presentation that has no dialog (`rail`), the
 * open state is reconciled to closed, so no scrim, focus trap, body-scroll
 * lock, or orphaned aria-expanded can survive an incompatible transition.
 *
 * DETAIL — a Detail control activates a Workspace destination. When Evidence
 * is presented as overlay or sheet, that destination would otherwise open
 * behind the still-active Evidence surface, so the host dismisses Evidence as
 * part of the same action and returns focus to the affordance that opened it.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";
import { useOverlay } from "../../../overlay";
import { EvidenceRail, type EvidenceRailProps, type EvidenceSection } from "./EvidenceRail";
import { EvidenceAffordance } from "./EvidenceAffordance";
import { useEvidencePresentation } from "./evidence-presentation";

export interface EvidenceHostProps extends Omit<EvidenceRailProps, "presentation"> {
  /**
   * The Work surface. Receives the persistent Evidence affordance, which the
   * work surface places in its own header. The node is null while the
   * persistent rail is live, because the rail is already on screen.
   */
  work: (evidenceAffordance: React.ReactNode) => React.ReactNode;
  summary: string;
  triggerLabel?: string;
}

export function EvidenceHost({
  work,
  summary,
  triggerLabel = "Evidence",
  onOpenDetail,
  ...rail
}: EvidenceHostProps) {
  const presentation = useEvidencePresentation();
  const [open, setOpen] = React.useState(false);
  const [openedUnder, setOpenedUnder] = React.useState(presentation);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  // Presentation owns the dialog. When the viewport crosses into a different
  // presentation, the surface the reader opened no longer exists, so it is
  // retired in the same render — before anything can paint. Adjusting state
  // during render (rather than in an effect) is what guarantees no
  // intermediate commit shows a scrim, a trap, or an expanded trigger that
  // belongs to a presentation that is already gone.
  if (presentation !== openedUnder) {
    setOpenedUnder(presentation);
    if (open) setOpen(false);
  }

  const dialogPresentation = presentation === "rail" ? null : presentation;
  const dialogOpen = open && dialogPresentation !== null && presentation === openedUnder;

  const close = React.useCallback(() => {
    setOpen(false);
  }, []);
  const { ref, onBackdropMouseDown } = useOverlay(dialogOpen, close);

  // A Detail action must visibly reveal its Workspace destination. Dismiss the
  // covering Evidence surface first, then hand off to the workspace.
  const openDetail = React.useCallback(
    (section: EvidenceSection) => {
      setOpen(false);
      onOpenDetail?.(section);
    },
    [onOpenDetail],
  );

  const affordance =
    presentation === "rail" ? null : (
      <EvidenceAffordance
        ref={triggerRef}
        summary={summary}
        label={triggerLabel}
        open={dialogOpen}
        onOpen={() => setOpen(true)}
      />
    );

  return (
    <div className="eds-evidence-host" data-evidence-presentation={presentation}>
      <div className="eds-evidence-host__work">{work(affordance)}</div>
      {presentation === "rail" ? (
        <div className="eds-evidence-host__rail">
          <EvidenceRail {...rail} presentation="rail" onOpenDetail={onOpenDetail} />
        </div>
      ) : null}
      {dialogOpen && dialogPresentation ? (
        <div className="eds-evidence__scrim" onMouseDown={onBackdropMouseDown}>
          <div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label="Evidence"
            className="eds-evidence-host__dialog"
            data-evidence-presentation={dialogPresentation}
          >
            <EvidenceRail
              {...rail}
              id={`${rail.id ?? "eds-evidence-rail"}-dialog`}
              presentation={dialogPresentation}
              onOpenDetail={openDetail}
            />
            <button type="button" className="eds-evidence__close" onClick={close}>
              Close evidence
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
