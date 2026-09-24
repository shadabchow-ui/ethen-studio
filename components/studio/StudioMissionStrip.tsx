import Link from "next/link";

export function StudioMissionStrip() {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-[16px] ethen-panel-smoked px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg-elevated)] text-[var(--text-primary)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v18M3 12h18" />
            </svg>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">Start a Studio Project</p>
            <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
              Create an image · Turn it into video · Save an asset · Build a canvas
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/studio/image"
            className="ethen-liquid-white-button"
          >
            Create Image
          </Link>
          <Link
            href="/studio/canvas"
            className="ethen-secondary-button"
          >
            Open Canvas
          </Link>
        </div>
      </div>
    </section>
  );
}
