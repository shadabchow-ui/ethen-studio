"use client";

import type { ReactNode } from "react";
import { cn } from "./lib/utils";

interface ArtifactFrameProps {
  eyebrow?: string;
  title?: string;
  meta?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function ArtifactFrame({
  eyebrow,
  title,
  meta,
  actions,
  children,
  className,
  bodyClassName,
}: ArtifactFrameProps) {
  return (
    <section
      className={cn(
        "artifact-frame overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]",
        className,
      )}
    >
      {(eyebrow || title || meta || actions) && (
        <header className="artifact-frame__header flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="min-w-0 space-y-1">
            {eyebrow ? (
              <p className="text-[10px] font-normal uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                {title}
              </p>
            ) : null}
            {meta ? (
              <p className="text-[10px] text-[var(--text-tertiary)]">
                {meta}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      )}
      <div className={cn("px-4 py-3", bodyClassName)}>{children}</div>
    </section>
  );
}

interface ArtifactCopyButtonProps {
  copied: boolean;
  onClick: () => void;
  className?: string;
}

export function ArtifactCopyButton({
  copied,
  onClick,
  className,
}: ArtifactCopyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]",
        className,
      )}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
