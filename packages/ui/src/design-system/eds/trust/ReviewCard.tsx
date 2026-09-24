"use client";

/**
 * EDS ReviewCard — D12 signature component.
 *
 * The artifact is the page; judgement is the margin.
 *
 * The thing being reviewed gets the width and the reading attention. The
 * verdict controls and annotations sit in the margin, deliberately quiet,
 * because a review surface that shouts its own controls trains people to
 * decide before they have read.
 *
 * Both verdicts are neutral. Neither is green, neither is red, and neither is
 * visually preferred — the reviewer's judgement is the signal, and a design
 * that pre-weights one answer is applying pressure. The selected verdict is
 * marked with a glyph and text as well as a wash, so the choice survives
 * forced-colors and never depends on colour.
 *
 * `Turn this into a rule` is a marked dependency: rule enforcement does not
 * exist, so the control is inert and labelled rather than wired to nothing.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";
import { DependencyTarget } from "./Dependency";

export type ReviewVerdict = "accept" | "revise";

export type ReviewAnnotation = Readonly<{
  id: string;
  /** The line, range, or region this note attaches to. */
  anchor: string;
  note: string;
}>;

export const REVIEW_VERDICT_TEXT: Record<ReviewVerdict, string> = {
  accept: "Looks right",
  revise: "Needs changes",
};

export interface ReviewCardProps {
  title: string;
  /** What is under review. Gets the page. */
  artifact: React.ReactNode;
  annotations?: readonly ReviewAnnotation[];
  verdict?: ReviewVerdict | null;
  onVerdictChange?: (verdict: ReviewVerdict) => void;
  /**
   * Render "Turn this into a rule" as an inert dependency target. Off by
   * default for the same reason as ApprovalCard: the marker is a Lab review
   * affordance, and "DEPENDS ON: V7" is programme language, not product
   * language. D19 ships judgement capture without rule enforcement, so the
   * production port simply will not offer the control.
   */
  showDependencies?: boolean;
  id?: string;
}

export function ReviewCard({
  title,
  artifact,
  annotations = [],
  verdict = null,
  onVerdictChange,
  showDependencies = false,
  id,
}: ReviewCardProps) {
  const reactId = React.useId();
  const cardId = id ?? `eds-review-${reactId}`;

  return (
    <section id={cardId} className="eds-review" aria-labelledby={`${cardId}-title`}>
      <header className="eds-review__head">
        <h3 id={`${cardId}-title`} className="eds-review__title">{title}</h3>
      </header>

      <div className="eds-review__body">
        <div className="eds-review__artifact">{artifact}</div>

        <aside className="eds-review__margin" aria-label="Review notes and verdict">
          {annotations.length > 0 ? (
            <ol className="eds-review__annotations">
              {annotations.map((annotation) => (
                <li key={annotation.id} className="eds-review__annotation">
                  <span className="eds-review__anchor">{annotation.anchor}</span>
                  <span className="eds-review__note">{annotation.note}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="eds-review__no-annotations">No notes yet.</p>
          )}

          <div className="eds-review__verdict" role="radiogroup" aria-label="Verdict">
            {(["accept", "revise"] as const).map((option) => {
              const selected = verdict === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className="eds-review__verdict-option"
                  data-selected={selected ? "true" : "false"}
                  onClick={() => onVerdictChange?.(option)}
                >
                  {/* Glyph plus text: the selection never rests on colour. */}
                  <span aria-hidden className="eds-review__verdict-glyph">{selected ? "◉" : "○"}</span>
                  <span className="eds-review__verdict-text">{REVIEW_VERDICT_TEXT[option]}</span>
                </button>
              );
            })}
          </div>

          {showDependencies ? (
            <DependencyTarget
              label="Turn this into a rule"
              dependsOn="V7"
              note="rule enforcement does not exist yet"
            />
          ) : null}
        </aside>
      </div>
    </section>
  );
}
