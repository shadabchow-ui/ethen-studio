import type { StudioPageHeaderProps } from "./types";

/**
 * STUDIO_08 — shared page header. Title/context first, one surface
 * boundary, no nested-card chrome. routeMarker stamps the verified
 * identity marker for measurement. M6B: the header sits directly on the
 * canvas (console tone, ElevenLabs-style) so the content below is the only
 * carded surface.
 */
export function StudioPageHeader({ eyebrow, title, description, routeMarker, status, actions }: StudioPageHeaderProps) {
  return (
    <div className="pb-2">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-[780px]">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{eyebrow}</p>
          ) : null}
          <h1
            tabIndex={-1}
            data-iex-route={routeMarker ?? undefined}
            className="mt-2 text-[24px] font-medium leading-[1.15] tracking-[-0.015em] text-[var(--text-primary)] sm:text-[28px]"
          >
            {title}
          </h1>
          <p className="mt-2 max-w-[72ch] text-[13px] leading-5 text-[var(--text-secondary)]">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {status ? (
        <div className="mt-4 flex flex-wrap gap-2" role="status">
          {status}
        </div>
      ) : null}
    </div>
  );
}
