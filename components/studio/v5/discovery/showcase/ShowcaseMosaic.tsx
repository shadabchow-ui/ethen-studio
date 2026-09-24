"use client";

import * as React from "react";
import Link from "next/link";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import { StudioNavIcon } from "../../shell/studio-nav-icons";
import type { StudioShowcaseItem } from "../../../../../lib/studio-v5/showcase-feed";
import type { LabAspectRatio } from "../../../../../lib/studio-v5/media-manifest";
import { ShowcaseTile } from "./ShowcaseTile";
import { showcaseAttribution } from "./attribution";
import styles from "./showcase.module.css";

const SPAN_CLASS: Readonly<Record<LabAspectRatio, string>> = {
  "16/9": styles.t169!,
  "3/2": styles.t32!,
  "21/9": styles.t219!,
  "9/16": styles.t916!,
  "1/1": styles.t11!,
  "4/5": styles.t45!,
};

export type MosaicKind = "video" | "image" | "uniform";

/**
 * Mixed-ratio discovery wall. `cap` clips it to a preview height that fades
 * into a centred View-all pill (clipped tiles become inert so keyboard
 * focus never lands out of sight). Uncapped walls are for Explore pages.
 */
export function ShowcaseMosaic({
  items,
  kind,
  projectId,
  label,
  cap = null,
  anchorEvery = 9,
  eagerCount = 0,
}: {
  items: readonly StudioShowcaseItem[];
  kind: MosaicKind;
  projectId: string | null;
  label: string;
  cap?: { label: string; href: string } | null;
  /** Video walls: every Nth landscape item becomes a 2×2 anchor (≥730px). */
  anchorEvery?: number;
  eagerCount?: number;
}) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  // Capped walls: tiles whose top edge is below the visible band are made
  // inert (not focusable, hidden from assistive tech). Attributes are set
  // directly — React does not own them — from a resize observer.
  React.useEffect(() => {
    if (!cap) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const sync = () => {
      const visible = wrap.clientHeight - 60;
      for (const cell of wrap.querySelectorAll<HTMLElement>("[data-showcase-cell]")) {
        const hidden = cell.offsetTop >= visible;
        cell.toggleAttribute("inert", hidden);
        if (hidden) cell.setAttribute("aria-hidden", "true");
        else cell.removeAttribute("aria-hidden");
      }
    };
    const frame = requestAnimationFrame(sync);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(wrap);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [cap, items.length]);

  // Every Nth landscape item of a video wall is a 2×2 anchor (from 730px).
  const anchors = new Set<string>();
  if (kind === "video") {
    let landscapeSeen = 0;
    for (const item of items) {
      if (item.aspectRatio !== "16/9" && item.aspectRatio !== "3/2") continue;
      if (landscapeSeen % anchorEvery === 0) anchors.add(item.id);
      landscapeSeen += 1;
    }
  }
  const cells = items.map((item, index) => {
    const anchor = anchors.has(item.id);
    const span = kind === "uniform" ? "" : `${SPAN_CLASS[item.aspectRatio]} ${anchor ? styles.anchor : ""}`;
    return (
      <div key={item.id} data-showcase-cell className={`${styles.cell} ${span}`}>
        <ShowcaseTile item={item} projectId={projectId} className="h-full w-full" attribution={showcaseAttribution(item)} eager={index < eagerCount} />
      </div>
    );
  });

  const gridClass = `${styles.grid} ${styles[kind]}`;
  return (
    <div className={styles.mosaic}>
      <div ref={wrapRef} className={cap ? `${styles.capped} ${kind === "image" ? styles.capImage : styles.capVideo}` : ""}>
        <div role="list" aria-label={label} className={gridClass}>
          {cells.map((cell) => (
            <div key={cell.key} role="listitem" className="contents">
              {cell}
            </div>
          ))}
        </div>
      </div>
      {cap ? (
        <>
          <div aria-hidden="true" className={styles.fade} />
          <div className={styles.pill}>
            <Link
              href={cap.href}
              className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] px-4 text-[12.5px] font-medium text-[var(--text-primary)] shadow-[0_10px_30px_color-mix(in_srgb,var(--studio-primary-fg)_60%,transparent)] transition-colors hover:bg-[var(--studio-bg-selected)] pointer-fine:min-h-[36px] ${STUDIO_FOCUS_RING_CLASS}`}
            >
              {cap.label}
              <StudioNavIcon name="open" size={12} />
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
