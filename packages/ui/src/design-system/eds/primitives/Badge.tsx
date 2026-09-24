import * as React from "react";

export type EdsBadgeVariant = "neutral" | "info";

export interface EdsBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: EdsBadgeVariant;
}

export function EdsBadge({ variant = "neutral", className, ...props }: EdsBadgeProps) {
  return (
    <span
      className={["eds-badge", variant === "info" ? "eds-badge--info" : "", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
