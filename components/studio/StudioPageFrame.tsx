import type { ReactNode } from "react";
import Link from "next/link";

interface StudioPageFrameProps {
  eyebrow?: string;
  title: string;
  description: string;
  statusPills?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /**
   * Remediation Pass 1: route template stamped as `data-iex-route` on the
   * visible page title. Pass the section template (e.g. /studio/assets).
   */
  routeMarker?: string;
}

export function StudioPageFrame({
  eyebrow,
  title,
  description,
  statusPills,
  actions,
  children,
  routeMarker,
}: StudioPageFrameProps) {
  return (
    <main className="dark min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="min-h-screen bg-[var(--bg-base)]">

        <div className="mx-auto w-full max-w-[1660px] px-4 pb-20 pt-8 sm:px-6 lg:px-14 lg:pb-28">
          <div className="mx-auto max-w-[1548px] space-y-8">
            <Link
              href="/studio/apps"
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
              Back to Studio Apps
            </Link>

            <section className="ethen-panel-smoked flex flex-col gap-5 rounded-[24px] px-6 py-6 sm:px-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-[780px]">
                  {eyebrow ? (
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--text-secondary)]">
                      {eyebrow}
                    </p>
                  ) : null}
                  <h1 tabIndex={-1} className="mt-2 text-[34px] leading-[1.04] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[40px]" data-iex-route={routeMarker ?? undefined}>
                    {title}
                  </h1>
                  <p className="mt-3 max-w-[760px] text-[13.5px] leading-6 text-[var(--text-secondary)]">
                    {description}
                  </p>
                </div>
                {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
              </div>
              {statusPills ? <div className="flex flex-wrap gap-2">{statusPills}</div> : null}
            </section>

            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
