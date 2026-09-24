"use client";

/**
 * Discovery modules — the editorial building blocks of the Studio home and
 * Explore: feature rail, capability tiles, flagship panel, app spotlight,
 * model spotlight, fanned specialized band. Chrome stays charcoal; media
 * supplies the colour. Every module links to a canonical Studio route.
 */

import * as React from "react";
import Link from "next/link";
import { StudioEmptyState, StudioErrorState } from "../../shell";
import { StudioNavIcon } from "../../shell/studio-nav-icons";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import { capabilityHref, capabilityRouteFor } from "../../create/composer-registry";
import type { useCatalogProjection } from "../useCatalogProjection";
import { HomeArt, HomeRail, HomeSectionHead, RAIL_ITEM_CLASS, type HomeArtMotif } from "../StudioHomeCards";
import type { StudioShowcaseItem } from "../../../../../lib/studio-v5/showcase-feed";

/** Below this many items a spotlight shows key art + its workflow instead of a wall. */
const MIN_WALL = 3;
import { ShowcaseMosaic } from "./ShowcaseMosaic";
import { ShowcaseTile } from "./ShowcaseTile";
import { showcaseAttribution } from "./attribution";
import styles from "./showcase.module.css";

const focus = STUDIO_FOCUS_RING_CLASS;

export function withProject(href: string, projectId: string | null): string {
  if (!projectId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}projectId=${encodeURIComponent(projectId)}`;
}

const PRIMARY_CTA = `inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] bg-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--accent-fg)] transition-opacity hover:opacity-90 active:opacity-80 pointer-fine:min-h-[38px] ${focus}`;
const SECONDARY_CTA = `inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--studio-bg-selected)] pointer-fine:min-h-[38px] ${focus}`;

/* ── Key art (a still or designed art) ───────────────────────────────── */

export type KeyArt = { kind: "item"; item: StudioShowcaseItem } | { kind: "art"; motif: HomeArtMotif; steps?: readonly string[] };

function KeyArtView({ art, className = "", eager = false }: { art: KeyArt; className?: string; eager?: boolean }) {
  if (art.kind === "art") return <HomeArt motif={art.motif} steps={art.steps} className={className} />;
  const position = "50% 40%";
  return (
    <div className={`relative overflow-hidden bg-[var(--bg-inset)] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static manifest key art */}
      <img src={art.item.posterUrl} alt="" loading={eager ? "eager" : "lazy"} decoding="async" style={{ objectPosition: position }} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] motion-reduce:transition-none" />
    </div>
  );
}

/* ── 3. Feature rail ─────────────────────────────────────────────────── */

export interface FeatureRailEntry {
  id: string;
  title: string;
  line: string;
  href: string;
  art: KeyArt;
}

export function FeatureRail({ entries }: { entries: readonly FeatureRailEntry[] }) {
  return (
    <section aria-label="What's new">
      <HomeSectionHead title="What's new in Studio" />
      <HomeRail label="Studio features">
        {entries.map((entry, index) => (
          <li key={entry.id} className={RAIL_ITEM_CLASS}>
            <Link href={entry.href} className={`group block min-h-[44px] rounded-[12px] ${focus}`}>
              <KeyArtView art={entry.art} eager={index < 2} className="aspect-[16/9] rounded-[10px]" />
              <span className="mt-2.5 block text-[13.5px] font-semibold uppercase tracking-[0.02em] text-[var(--text-primary)]">{entry.title}</span>
              <span className="mt-0.5 block truncate text-[12px] text-[var(--text-tertiary)]">{entry.line}</span>
            </Link>
          </li>
        ))}
      </HomeRail>
    </section>
  );
}

/* ── 4. Capability tiles ─────────────────────────────────────────────── */

export interface CapabilityTile {
  id: string;
  title: string;
  line: string;
  icon: string;
  tag: string;
  href: string;
}

export function CapabilityTiles({ tiles }: { tiles: readonly CapabilityTile[] }) {
  return (
    <section aria-label="Capabilities">
      <h2 className="sr-only">Capabilities</h2>
      <ul className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 md:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-cols-[repeat(6,minmax(0,1fr))]">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <Link
              href={tile.href}
              className={`group flex h-full min-h-[44px] flex-col justify-between gap-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-3 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] ${focus}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span aria-hidden="true" className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                  <StudioNavIcon name={tile.icon} size={16} />
                </span>
                <span className="rounded-[5px] bg-[var(--bg-inset)] px-1.5 py-px text-[10px] text-[var(--text-secondary)]">{tile.tag}</span>
              </span>
              <span>
                <span className="block text-[13px] font-medium text-[var(--text-primary)]">{tile.title}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-[var(--text-tertiary)]">{tile.line}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── 5. Flagship feature panel ───────────────────────────────────────── */

export function FlagshipPanel({
  label,
  eyebrow,
  title,
  description,
  primary,
  secondary,
  art,
  collage,
}: {
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string } | null;
  art: KeyArt;
  /** Up to 6 output tiles shown as a poster wall beside the key art. */
  collage?: readonly StudioShowcaseItem[];
}) {
  const wall = (collage ?? []).slice(0, 6);
  return (
    <section aria-label={label} className="overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--studio-bg-app)]">
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="relative order-2 flex flex-col justify-center px-5 py-7 sm:px-8 lg:order-1 lg:py-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{eyebrow}</p>
          <h2 className="mt-2 text-[26px] font-semibold !uppercase leading-[1.02] tracking-[-0.01em] text-[var(--text-primary)] sm:text-[34px]">{title}</h2>
          <p className="mt-3 max-w-[44ch] text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">{description}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href={primary.href} className={PRIMARY_CTA}>
              {primary.label}
            </Link>
            {secondary ? (
              <Link href={secondary.href} className={SECONDARY_CTA}>
                {secondary.label}
              </Link>
            ) : null}
          </div>
        </div>
        <div className={`relative order-1 lg:order-2 lg:min-h-[400px] ${wall.length >= 3 ? "" : "min-h-[220px]"}`}>
          {wall.length >= 3 ? (
            <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1.5 p-1.5 lg:h-full">
              {wall.map((item, index) => (
                // Phones show one row of three; the full 3×2 wall from sm.
                <ShowcaseTile key={item.id} item={item} projectId={null} className={`aspect-[4/5] sm:aspect-[16/10] lg:aspect-auto ${index >= 3 ? "hidden sm:block" : ""}`} attribution={showcaseAttribution(item)} actions={false} />
              ))}
            </div>
          ) : (
            <>
              <div className="absolute inset-0">
                <KeyArtView art={art} eager className="h-full w-full" />
              </div>
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/3 bg-gradient-to-r from-[var(--studio-bg-app)] to-transparent lg:block" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[var(--studio-bg-app)] to-transparent lg:hidden" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── 7/10. App spotlight ─────────────────────────────────────────────── */

export function AppSpotlight({
  appTitle,
  eyebrow = "App",
  description,
  href,
  examplesHref,
  steps,
  outputs,
  art,
  projectId,
}: {
  appTitle: string;
  eyebrow?: string;
  description: string;
  href: string;
  examplesHref: string;
  steps: readonly string[];
  outputs: readonly StudioShowcaseItem[];
  art: KeyArt;
  projectId: string | null;
}) {
  const hasWall = outputs.length >= MIN_WALL;
  const videos = outputs.filter((item) => item.mediaType === "video").length;
  return (
    <section aria-label={`${appTitle} spotlight`} className="overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[var(--studio-bg-app)] p-3 sm:p-4">
      <div className="flex flex-col gap-4 px-2 pb-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
            <StudioNavIcon name="apps" size={11} />
            {eyebrow}
          </span>
          <h2 className="mt-2 text-[22px] font-semibold !uppercase leading-[1.05] tracking-[-0.005em] text-[var(--text-primary)] sm:text-[26px]">{appTitle}</h2>
          <p className="mt-1.5 max-w-[56ch] text-[13px] leading-[1.55] text-[var(--text-secondary)]">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={href} className={PRIMARY_CTA}>
            Open {appTitle}
          </Link>
          <Link href={examplesHref} className={SECONDARY_CTA}>
            See examples
          </Link>
        </div>
      </div>
      {hasWall ? (
        <ShowcaseMosaic items={outputs.slice(0, 14)} kind={videos >= outputs.length / 2 ? "video" : "image"} projectId={projectId} label={`${appTitle} outputs`} cap={{ label: `View all of ${appTitle}`, href: examplesHref }} />
      ) : (
        // Fallback: key art + the app's production chain (the workflow
        // diagram stays the explanation until real outputs exist).
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Link href={href} aria-label={`Open ${appTitle}`} className={`group block overflow-hidden rounded-[10px] ${focus}`}>
            <KeyArtView art={art} className="aspect-[16/9] md:aspect-[16/7]" />
          </Link>
          <div className="flex flex-col overflow-hidden rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <HomeArt motif="canvas" steps={steps} className="min-h-[140px] flex-1" />
            <p className="border-t border-[var(--border-subtle)] px-3.5 py-2.5 text-[12px] text-[var(--text-tertiary)]">{steps.join(" → ")}</p>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── 8. Model spotlight ──────────────────────────────────────────────── */

function playableFamilyRoute(tasks: readonly string[], projectId: string | null): string | null {
  for (const task of tasks) {
    const route = capabilityRouteFor(task);
    if (route?.status === "bound" && route.route) return capabilityHref(route, projectId) ?? route.route;
  }
  return null;
}

function fallbackPreview(items: readonly StudioShowcaseItem[], motif: HomeArtMotif, index: number): StudioShowcaseItem | null {
  const wanted = motif === "video" ? "video" : "image";
  const pool = items.filter((item) => item.placeholder && item.mediaType === wanted && (item.aspectRatio === "16/9" || item.aspectRatio === "3/2"));
  return pool.length > 0 ? pool[index % pool.length]! : null;
}

export interface CatalogView {
  state: ReturnType<typeof useCatalogProjection>["state"];
  projection: ReturnType<typeof useCatalogProjection>["projection"];
  retry: () => void;
}

/** Model spotlight body (the caller owns the <section> and the catalog read). */
export function ModelSpotlight({
  title,
  lead,
  taskPrefix,
  motif,
  projectId,
  items,
  viewAllHref,
  catalog,
}: {
  title: string;
  lead: string;
  taskPrefix: string;
  motif: HomeArtMotif;
  projectId: string | null;
  items: readonly StudioShowcaseItem[];
  viewAllHref: string;
  catalog: CatalogView;
}) {
  const { state, projection, retry } = catalog;
  const families = (projection?.families ?? []).filter((family) => family.tasks.some((task) => task.startsWith(taskPrefix))).slice(0, 8);
  return (
    <>
      <HomeSectionHead title={title} lead={lead} action={{ label: "Browse models", href: viewAllHref }} />
      {!projectId ? (
        <StudioEmptyState title="Choose a project to see its models" description="Which models are ready to run is resolved per project from the live catalog." actionLabel="Open projects" actionHref="/studio/work/projects" compact />
      ) : state === "loading" ? (
        <div role="status">
          <span className="sr-only">Loading model families…</span>
          <ul aria-hidden="true" className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))]">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className={`aspect-[16/12] rounded-[10px] bg-[var(--bg-surface)] ${index === 1 ? "hidden sm:block" : index > 1 ? "hidden lg:block" : ""}`} />
            ))}
          </ul>
        </div>
      ) : state === "error" ? (
        <StudioErrorState title="Couldn’t load models" description="Model discovery is unavailable right now." retryLabel="Retry" onRetry={retry} compact />
      ) : families.length === 0 ? (
        <StudioEmptyState title="No model families yet" description="The project catalog has no families for this capability." compact />
      ) : (
        <ul className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          {families.map((family, index) => {
            // Representative output when the family has one; otherwise a
            // placeholder slot of the matching modality keeps the geometry.
            const preview = items.find((item) => item.modelFamilyId === family.familyId) ?? fallbackPreview(items, motif, index);
            const playable = family.executableCount > 0 ? playableFamilyRoute(family.tasks, projectId) : null;
            return (
              <li key={family.familyId} className="group relative overflow-hidden rounded-[10px] bg-[var(--bg-surface)]">
                {preview ? (
                  <ShowcaseTile item={preview} projectId={projectId} className="aspect-[16/9]" actions={false} decorative />
                ) : (
                  <HomeArt motif={motif} className="aspect-[16/9]" />
                )}
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{family.label}</p>
                    <p className="truncate text-[11.5px] text-[var(--text-tertiary)]">
                      {family.providerId} · {family.executableCount} of {family.endpointCount} ready
                    </p>
                  </div>
                  {playable ? (
                    <Link href={playable} className={`inline-flex min-h-[44px] shrink-0 items-center rounded-[8px] bg-[var(--accent)] px-3 text-[12px] font-semibold text-[var(--accent-fg)] hover:opacity-90 pointer-fine:min-h-[30px] ${focus}`}>
                      Try
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-[30px] shrink-0 items-center rounded-[8px] bg-[var(--bg-inset)] px-2.5 text-[11.5px] text-[var(--text-tertiary)]">Cataloged</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* ── 13. All-apps directory card ─────────────────────────────────────── */

export function AppDirectoryCard({
  title,
  description,
  href,
  steps,
  tags,
  output,
  art,
}: {
  title: string;
  description: string;
  href: string;
  steps: readonly string[];
  tags: readonly string[];
  output: StudioShowcaseItem | null;
  art: HomeArtMotif;
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full min-h-[44px] flex-col overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] ${focus}`}
    >
      {output ? (
        <ShowcaseTile item={output} projectId={null} className="aspect-[16/9] rounded-none sm:aspect-[4/3]" actions={false} decorative />
      ) : (
        <HomeArt motif={art} steps={steps} className="aspect-[16/9] transition-[filter] duration-150 group-hover:brightness-125 sm:aspect-[4/3]" />
      )}
      <span className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-medium text-[var(--text-primary)]">{title}</span>
          <span className="shrink-0 text-[12px] text-[var(--text-secondary)]">Open ›</span>
        </span>
        <span className="mt-0.5 line-clamp-1 text-[12px] text-[var(--text-tertiary)]">{output ? steps.join(" → ") : description}</span>
        <span className="mt-auto flex flex-wrap gap-1.5 pt-2.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-[5px] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]">
              {tag}
            </span>
          ))}
        </span>
      </span>
    </Link>
  );
}

/* ── 11. Specialized band (fanned stack) ─────────────────────────────── */

export function SpecializedBand({
  label,
  eyebrow,
  title,
  description,
  cta,
  items,
  projectId,
}: {
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  cta: { label: string; href: string };
  items: readonly StudioShowcaseItem[];
  projectId: string | null;
}) {
  if (items.length < MIN_WALL) return null;
  const fan = items.slice(0, 5);
  return (
    <section aria-label={label} className="overflow-hidden rounded-[16px] border border-[var(--border-subtle)] bg-[linear-gradient(100deg,var(--bg-elevated),var(--studio-bg-app)_70%)]">
      <div className="grid items-center md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="px-5 py-7 sm:px-8">
          <span className="inline-flex rounded-[6px] bg-[var(--bg-inset)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">{eyebrow}</span>
          <h2 className="mt-2 text-[24px] font-semibold !uppercase leading-[1.04] text-[var(--text-primary)] sm:text-[28px]">{title}</h2>
          <p className="mt-2 max-w-[40ch] text-[13px] leading-[1.55] text-[var(--text-secondary)]">{description}</p>
          <Link href={cta.href} className={`${PRIMARY_CTA} mt-5`}>
            {cta.label}
          </Link>
        </div>
        <div className={`${styles.fan} mx-4 mb-6 md:mx-0 md:mb-0 md:h-[300px]`}>
          {fan.map((item, index) => {
            // Centre the stack for any count: 15% steps, a gentle arc, the
            // middle card on top.
            const count = fan.length;
            const offset = index - (count - 1) / 2;
            const left = (100 - (30 + (count - 1) * 15)) / 2 + index * 15;
            const style: React.CSSProperties = {
              left: `${left}%`,
              transform: `translateY(${-50 - (2 - Math.abs(offset)) * 3}%) rotate(${offset * 4.5}deg)`,
              zIndex: 10 - Math.round(Math.abs(offset) * 2),
            };
            return (
            <div key={item.id} className={styles.fanCard} style={style}>
              <ShowcaseTile item={item} projectId={projectId} className="h-full w-full" attribution={showcaseAttribution(item)} actions={false} />
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
