import Link from "next/link";
import { StudioStatusPill, type StudioStatusTone } from "./StudioStatusPill";

interface StudioWorkbenchHeaderProps {
  eyebrow: string;
  title: string;
  statusLabel: string;
  statusTone: StudioStatusTone;
  backHref: string;
  backLabel: string;
  liveLabel?: string;
}

export function StudioWorkbenchHeader({
  eyebrow,
  title,
  statusLabel,
  statusTone,
  backHref,
  backLabel,
  liveLabel,
}: StudioWorkbenchHeaderProps) {
  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M7.5 2 3.5 6l4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {backLabel}
      </Link>

      <section className="studio-jet-panel flex flex-col gap-4 rounded-[20px] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--text-primary)]">{eyebrow}</p>
          <h1 className="mt-1 text-[24px] leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[28px]">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {liveLabel ? (
            <span className="inline-flex items-center h-7 px-3 rounded-[8px] bg-[var(--bg-surface)] text-[var(--text-primary)] text-[11.5px] font-medium border border-[var(--border-default)] shadow-[inset_0_1px_0_var(--glass-inner-highlight)]">
              {liveLabel}
            </span>
          ) : null}
          <StudioStatusPill label={statusLabel} tone={statusTone} className="shrink-0" />
        </div>
      </section>
    </div>
  );
}
