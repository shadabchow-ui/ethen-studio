import Link from "next/link";
import { cn } from "@/lib/utils";
import { StudioStatusPill, type StudioStatusTone } from "./StudioStatusPill";

interface StudioRouteCardProps {
  title: string;
  description: string;
  href?: string;
  meta?: string;
  statusLabel?: string;
  statusTone?: StudioStatusTone;
  className?: string;
}

export function StudioRouteCard({
  title,
  description,
  href,
  meta,
  statusLabel,
  statusTone,
  className,
}: StudioRouteCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] text-[var(--text-primary)]">{title}</h3>
          <p className="mt-2 text-[12.5px] leading-6 text-[var(--text-secondary)]">{description}</p>
        </div>
        {statusLabel ? (
          <StudioStatusPill label={statusLabel} tone={statusTone} className="shrink-0" />
        ) : null}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          {meta ?? "Studio surface"}
        </span>
        {href ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-primary)]">
            Open
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden
            >
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </span>
        ) : null}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "block rounded-[18px] bg-[var(--bg-surface)] px-5 py-5 transition-colors hover:bg-[var(--bg-elevated)]",
          className,
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cn("rounded-[18px] bg-[var(--bg-surface)] px-5 py-5", className)}>
      {content}
    </div>
  );
}
