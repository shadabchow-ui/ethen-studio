import * as React from "react";

export interface EdsCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export function EdsCard({ title, className, children, ...props }: EdsCardProps) {
  return (
    <div className={["eds-card", className].filter(Boolean).join(" ")} {...props}>
      {title ? <h3 className="eds-card__title">{title}</h3> : null}
      <div className="eds-card__body">{children}</div>
    </div>
  );
}

export interface EdsPanelProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
}

export function EdsPanel({ title, className, children, ...props }: EdsPanelProps) {
  return (
    <section className={["eds-panel", className].filter(Boolean).join(" ")} {...props}>
      {title ? <h3 className="eds-panel__title">{title}</h3> : null}
      {children}
    </section>
  );
}
