"use client";

import type { ReactNode } from "react";
import { cn } from "./lib/utils";

type ArtifactCardTone = "default" | "studio" | "warning";

const toneClasses: Record<ArtifactCardTone, string> = {
  default:
    "border border-white/[0.10] bg-[#0a0a0a]",
  studio:
    "studio-jet-card border border-white/[0.08] bg-[#111111]/96",
  warning:
    "border border-[#3d2c10] bg-[#1e1608] text-[#f0c070]",
};

interface ArtifactCardShellProps {
  title: string;
  eyebrow?: string;
  summary?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  media?: ReactNode;
  children?: ReactNode;
  tone?: ArtifactCardTone;
  selected?: boolean;
  interactive?: boolean;
  className?: string;
  bodyClassName?: string;
  onClick?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function ArtifactCardShell({
  title,
  eyebrow,
  summary,
  badges,
  actions,
  footer,
  media,
  children,
  tone = "default",
  selected = false,
  interactive = false,
  className,
  bodyClassName,
  onClick,
  onKeyDown,
}: ArtifactCardShellProps) {
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "overflow-hidden rounded-[20px] p-4 transition",
        toneClasses[tone],
        interactive && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 hover:bg-white/[0.05]",
        selected && "ring-1 ring-white/18",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#a3a3a3]">
              {eyebrow}
            </p>
          ) : null}
          <h3 className="mt-1 text-[15px] font-medium leading-6 text-[#fafafa]">{title}</h3>
          {summary ? (
            <p className="mt-2 text-[12.5px] leading-6 text-[#a3a3a3]">{summary}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      {badges ? <div className="mt-3 flex flex-wrap gap-2">{badges}</div> : null}
      {media ? <div className="mt-4">{media}</div> : null}
      {children ? <div className={cn("mt-4", bodyClassName)}>{children}</div> : null}
      {footer ? (
        <div           className="mt-4 border-t border-white/[0.10] pt-3 text-[11px] text-[#a3a3a3]">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
