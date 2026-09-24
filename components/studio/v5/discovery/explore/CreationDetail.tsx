"use client";

/**
 * Creation detail — the canonical page (/studio/explore/creation/[id]) and
 * the intercepted overlay render the same content. Only real metadata is
 * shown: a field without data is omitted, never invented.
 */

import * as React from "react";
import Link from "next/link";
import { StudioEmptyState } from "../../shell";
import { StudioNavIcon } from "../../shell/studio-nav-icons";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import { useStudioIdentity } from "../../../studio-project-scope";
import { capabilityHref, capabilityRouteFor } from "../../create/composer-registry";
import { useCatalogProjection } from "../useCatalogProjection";
import {
  aspectLabel,
  formatDuration,
  itemTitle,
  provenanceLabel,
  remixHref,
  showcaseById,
} from "../../../../../lib/studio-v5/showcase-feed";
import { appHref, appTitle } from "../showcase/attribution";

const focus = STUDIO_FOCUS_RING_CLASS;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    const frame = requestAnimationFrame(sync);
    query.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      query.removeEventListener("change", sync);
    };
  }, []);
  return reduced;
}

export function CreationDetail({ creationId, mode, headingId }: { creationId: string; mode: "page" | "dialog"; headingId?: string }) {
  const item = React.useMemo(() => showcaseById(creationId), [creationId]);
  const { identity } = useStudioIdentity();
  const projectId = identity.projectId;
  const catalog = useCatalogProjection(projectId);
  const reducedMotion = useReducedMotion();
  const [videoFailed, setVideoFailed] = React.useState(false);
  const [promptOpen, setPromptOpen] = React.useState(false);

  if (!item) {
    return (
      <div className="p-6">
        <h2 id={headingId} tabIndex={-1} className="sr-only">
          Creation not found
        </h2>
        <StudioEmptyState title="Creation not found" description="It may have been removed from the showcase." actionLabel="Back to Explore" actionHref="/studio/explore" />
      </div>
    );
  }

  const title = itemTitle(item);
  const app = appTitle(item.appId);
  const appLink = appHref(item.appId);
  const family = item.modelFamilyId ? (catalog.projection?.families.find((entry) => entry.familyId === item.modelFamilyId) ?? null) : null;
  let useModelHref: string | null = null;
  if (family && family.executableCount > 0) {
    for (const task of family.tasks) {
      const route = capabilityRouteFor(task);
      if (route?.status === "bound" && route.route) {
        useModelHref = capabilityHref(route, projectId) ?? route.route;
        break;
      }
    }
  }
  const remix = remixHref(item, projectId);
  const duration = formatDuration(item.durationSeconds);
  const details: { label: string; value: string }[] = [
    { label: "Type", value: item.mediaType === "video" ? "Video" : "Image" },
    { label: "Format", value: aspectLabel(item.aspectRatio) },
    ...(duration ? [{ label: "Duration", value: duration }] : []),
    ...(family ? [{ label: "Model", value: family.label }] : []),
    ...(item.categories.length > 0 ? [{ label: "Category", value: item.categories.map((entry) => entry[0]!.toUpperCase() + entry.slice(1)).join(", ") }] : []),
  ];
  const aspect = item.aspectRatio.replace("/", " / ");

  const viewer = (
    <div className="relative flex h-full min-h-[240px] items-center justify-center bg-[var(--studio-bg-app)] p-3 sm:p-6">
      <div className="relative max-h-full w-full max-w-full overflow-hidden rounded-[10px]" style={{ aspectRatio: aspect, maxHeight: mode === "dialog" ? "min(76dvh, 760px)" : "70dvh", width: "auto", height: "100%" }}>
        {item.mediaType === "video" && item.videoUrl && !videoFailed ? (
          <video
            key={item.id}
            src={item.videoUrl}
            poster={item.posterUrl}
            controls
            muted
            playsInline
            autoPlay={!reducedMotion}
            loop
            preload="metadata"
            aria-label={title}
            onError={() => setVideoFailed(true)}
            className="h-full w-full bg-[var(--bg-inset)] object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- static manifest media
          <img src={item.posterUrl} alt={title} className="h-full w-full object-contain" />
        )}
        {videoFailed ? <span className="absolute left-3 top-3 rounded-[6px] bg-black/60 px-2 py-0.5 text-[11px] text-white">Video unavailable — showing still</span> : null}
      </div>
    </div>
  );

  const panel = (
    <div className="flex min-h-0 flex-col gap-4 p-5">
      <div className="min-w-0 pr-10">
        <h2 id={headingId} tabIndex={-1} className="text-[16px] font-semibold leading-tight text-[var(--text-primary)] outline-none">
          {title}
        </h2>
        {item.placeholder ? (
          <p className="mt-1 text-[12.5px] text-[var(--text-tertiary)]">Sample media holding this {app ? `${app} ` : ""}slot until the final showcase is published.</p>
        ) : app && appLink ? (
          <Link href={appLink} className={`mt-1 inline-flex items-center gap-1 text-[12.5px] text-[var(--text-secondary)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text-primary)] ${focus}`}>
            Created with {app}
          </Link>
        ) : family ? (
          <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">Made with {family.label}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        {remix ? (
          <Link href={remix} className={`flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[10px] bg-[var(--accent)] text-[13.5px] font-semibold text-[var(--accent-fg)] hover:opacity-90 ${focus}`}>
            <StudioNavIcon name="remix" size={15} />
            Remix
          </Link>
        ) : null}
        {useModelHref || appLink ? (
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2">
            {useModelHref ? (
              <Link href={useModelHref} className={`inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-[var(--bg-elevated)] px-3 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--studio-bg-selected)] pointer-fine:min-h-[38px] ${focus}`}>
                Use model
              </Link>
            ) : null}
            {appLink ? (
              <Link href={appLink} className={`inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-[var(--bg-elevated)] px-3 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--studio-bg-selected)] pointer-fine:min-h-[38px] ${useModelHref ? "" : "col-span-2"} ${focus}`}>
                Open {app ?? "app"}
              </Link>
            ) : null}
          </div>
        ) : null}
        {remix && !item.promptExcerpt && !item.placeholder ? <p className="text-[11.5px] text-[var(--text-tertiary)]">Some original settings are unavailable — Remix opens the closest supported tool.</p> : null}
      </div>

      {item.allowPromptReuse && item.promptExcerpt ? (
        <div className="rounded-[10px] bg-[var(--bg-inset)] px-3 py-2.5">
          <p className="text-[11.5px] font-medium text-[var(--text-tertiary)]">Prompt</p>
          <p className={`mt-1 text-[13px] leading-[1.5] text-[var(--text-secondary)] ${promptOpen ? "" : "line-clamp-6"}`}>{item.promptExcerpt}</p>
          <button type="button" onClick={() => setPromptOpen((open) => !open)} className={`mt-1 text-[12px] text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-primary)] ${focus}`}>
            {promptOpen ? "Show less" : "Show full prompt"}
          </button>
        </div>
      ) : null}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]">
        {details.map((row) => (
          <React.Fragment key={row.label}>
            <dt className="text-[var(--text-tertiary)]">{row.label}</dt>
            <dd className="m-0 truncate text-[var(--text-primary)]">{row.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="text-[11.5px] text-[var(--text-tertiary)]">{provenanceLabel(item)}</p>
    </div>
  );

  if (mode === "dialog") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,auto)_auto] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1 lg:overflow-hidden">
        {viewer}
        <div className="border-t border-[var(--border-subtle)] lg:overflow-y-auto lg:border-l lg:border-t-0">{panel}</div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Link href="/studio/explore" className={`inline-flex min-h-[44px] items-center gap-1 text-[12.5px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] pointer-fine:min-h-[32px] ${focus}`}>
        <span aria-hidden="true" className="rotate-180">
          <StudioNavIcon name="chevron" size={13} />
        </span>
        Explore
      </Link>
      <div className="overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
        {viewer}
        <div className="border-t border-[var(--border-subtle)] lg:border-l lg:border-t-0">{panel}</div>
      </div>
    </div>
  );
}
