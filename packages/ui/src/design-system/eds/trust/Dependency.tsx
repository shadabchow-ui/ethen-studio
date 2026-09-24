"use client";

/**
 * EDS Dependency marker — D12.
 *
 * The canonical way to show a capability the product does not have yet.
 *
 * This exists because the alternative — quietly omitting the control, or
 * worse, rendering one that does nothing — is how a design system starts
 * lying about the product. A marked dependency is honest in both directions:
 * the reader learns the capability is coming and cannot mistake it for
 * something they can use, and the team sees the gap every time they open the
 * Lab.
 *
 * A dependency target is NEVER an enabled control. It is not focusable, it
 * carries no click handler, and assistive technology reads the dependency
 * alongside the label rather than announcing a button that does nothing.
 *
 * Inherits the containing EDS surface scope. Do not add data-eds here.
 */
import * as React from "react";

export interface DependencyProps {
  /** What the capability would be called if it existed. */
  label: string;
  /** The system it waits on, e.g. "V7". */
  dependsOn: string;
  /** Optional plain-language note about what is missing. */
  note?: string;
}

/**
 * A named future capability, rendered as an inert target. Used where a real
 * control would sit, so the shape of the finished surface stays legible.
 */
export function DependencyTarget({ label, dependsOn, note }: DependencyProps) {
  return (
    <span
      className="eds-trust__dependency"
      data-depends-on={dependsOn}
      role="note"
      aria-label={`${label} — depends on ${dependsOn}, not available yet${note ? `: ${note}` : ""}`}
    >
      <span aria-hidden className="eds-trust__dependency-label">{label}</span>
      <span aria-hidden className="eds-trust__dependency-tag">DEPENDS ON: {dependsOn}</span>
    </span>
  );
}

/**
 * A block-level dependency note, for a whole section of evidence that cannot
 * be shown because the record does not carry it.
 */
export function DependencyNote({ label, dependsOn, note }: DependencyProps) {
  return (
    <p className="eds-trust__dependency-note" data-depends-on={dependsOn}>
      <span className="eds-trust__dependency-tag">DEPENDS ON: {dependsOn}</span>{" "}
      {label}
      {note ? ` — ${note}` : ""}
    </p>
  );
}
