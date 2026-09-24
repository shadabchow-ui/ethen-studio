import * as React from "react";

export type EdsToastTone = "neutral" | "pending" | "informational" | "failure";

export interface EdsToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: EdsToastTone;
  title: string;
}

const GLYPH: Record<EdsToastTone, string | null> = {
  neutral: null,
  pending: "△",
  informational: "i",
  failure: "×",
};

export function EdsToast({ tone = "neutral", title, className, children, ...props }: EdsToastProps) {
  const glyph = GLYPH[tone];
  return (
    <div
      role={tone === "failure" ? "alert" : "status"}
      className={["eds-toast", tone !== "neutral" ? `eds-toast--${tone}` : "", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {glyph ? (
        <span aria-hidden className={`eds-toast__mark eds-toast__mark--${tone}`}>
          {glyph}
        </span>
      ) : null}
      <div className="eds-toast__body">
        <p className="eds-toast__title">{title}</p>
        {children ? <div className="eds-toast__description">{children}</div> : null}
      </div>
    </div>
  );
}
