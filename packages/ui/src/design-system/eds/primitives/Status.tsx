import * as React from "react";

export type EdsStatusTone = "neutral" | "selected" | "pending" | "informational" | "failure" | "success";

export interface EdsStatusProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: EdsStatusTone;
}

const GLYPH: Record<EdsStatusTone, string | null> = {
  neutral: null,
  selected: null,
  pending: "△",
  informational: "i",
  failure: "×",
  success: "✓",
};

export function EdsStatus({ tone = "neutral", className, children, ...props }: EdsStatusProps) {
  const glyph = GLYPH[tone];
  return (
    <span
      className={["eds-status", tone === "pending" ? "eds-status--pending" : "", tone === "failure" ? "eds-status--failure" : "", tone === "selected" ? "eds-status--selected" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <span aria-hidden className={`eds-status-dot eds-status-dot--${tone}`} />
      {glyph ? (
        <span aria-hidden className="eds-status__glyph">
          {glyph}
        </span>
      ) : null}
      {children}
    </span>
  );
}
