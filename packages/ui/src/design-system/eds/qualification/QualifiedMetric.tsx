"use client";

/**
 * D15-J04 — shared qualification vocabulary.
 *
 * Every number keeps its qualification: measured, estimated, missing, zero,
 * stale, fresh. Two hard rules from the approved specimens:
 *
 * - A legitimate zero is real data and renders as zero — never as missing.
 * - An estimated value carries exactly one estimate marker, owned here, so
 *   callers can never double it ("Est. $4.20 (estimated)").
 *
 * Judgement stays separated from measurement: this component qualifies, it
 * never verdicts. It is consumed by F-04, F-12, F-13, F-14 and the later
 * brand Models surface.
 */
import * as React from "react";

export type Qualification = "measured" | "estimated" | "missing" | "zero" | "stale" | "fresh";

/**
 * The single rule everything else follows: only null/undefined (or an
 * explicit "missing" qualification) is missing. A legitimate zero —
 * including a source-backed zero — is data and is never missing.
 */
export function isMissingValue(
  value: number | null | undefined,
  qualification: Qualification,
): boolean {
  return value === null || value === undefined || qualification === "missing";
}

/** Type-narrowing twin of {@link isMissingValue} for render paths. */
export function hasQualifiedValue(
  value: number | null | undefined,
  qualification: Qualification,
): value is number {
  return !isMissingValue(value, qualification);
}

/**
 * Serializable formatter selector. A client component cannot receive a
 * function across the RSC boundary, so server components name the
 * presentation instead of passing one (D15-J11B6).
 */
export type QualifiedFormat = "plain" | "number" | "usd";

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
/** Matches the gateway's currency presentation (4 fraction digits max). */
const USD_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

function resolveFormat(
  format: ((value: number) => string) | undefined,
  formatAs: QualifiedFormat | undefined,
): (value: number) => string {
  if (format) return format;
  if (formatAs === "number") return (n) => NUMBER_FORMAT.format(n);
  if (formatAs === "usd") return (n) => USD_FORMAT.format(n);
  return (n) => String(n);
}

export interface QualifiedMetricProps {
  label: string;
  /**
   * Null/undefined means no data — renders missing ("—"), never zero.
   * A real zero arrives as 0 with qualification "zero".
   */
  value: number | null | undefined;
  qualification: Qualification;
  /**
   * Formats the numeric value. Client components only — functions are not
   * serializable, so a server component must use {@link formatAs} instead.
   */
  format?: (value: number) => string;
  /**
   * Serializable alternative to {@link format} for server components.
   * Ignored when `format` is supplied. Defaults to plain string conversion.
   */
  formatAs?: QualifiedFormat;
  /** Where the number came from (basis, source). Shown once, beneath. */
  basis?: string;
  /** Freshness line (fetched date, window). Shown once, beneath. */
  freshness?: string;
  id?: string;
}

export function QualifiedMetric({
  label,
  value,
  qualification,
  format,
  formatAs,
  basis,
  freshness,
  id,
}: QualifiedMetricProps) {
  const formatValue = resolveFormat(format, formatAs);
  if (!hasQualifiedValue(value, qualification)) {
    return (
      <div className="eds-qualified-metric" id={id}>
        <p className="eds-qualified-metric__label">{label}</p>
        <p className="eds-qualified-metric__value" data-qualification="missing">
          {/* A <p> has no role that permits aria-label (axe:
              aria-prohibited-attr), so the missing state is announced with
              real text instead. The label above supplies the subject. */}
          <span aria-hidden>—</span>
          <span className="eds-qualified-metric__sr">No data</span>
        </p>
        {freshness ? <p className="eds-qualified-metric__freshness">{freshness}</p> : null}
      </div>
    );
  }
  return (
    <div className="eds-qualified-metric" id={id}>
      <p className="eds-qualified-metric__label">{label}</p>
      <p
        className="eds-qualified-metric__value"
        data-qualification={qualification}
        data-value={value}
      >
        {formatValue(value)}
        {qualification === "estimated" ? <span className="eds-qualified-metric__marker"> est.</span> : null}
        {qualification === "stale" ? <span className="eds-qualified-metric__marker"> stale</span> : null}
      </p>
      {basis ? <p className="eds-qualified-metric__basis">{basis}</p> : null}
      {freshness ? <p className="eds-qualified-metric__freshness">{freshness}</p> : null}
    </div>
  );
}
