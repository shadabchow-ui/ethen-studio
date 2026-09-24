"use client";

import Link from "next/link";
import {
  HOME_MEDIA_SECTIONS,
  homeSectionMedia,
  type HomeMediaSection,
  type ResolvedLabMedia,
} from "@/lib/studio-v5/media-manifest";
import type { StudioRecentAsset } from "../shell/types";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";

export interface HomeMediaTile {
  key: string;
  title: string;
  href: string | null;
  poster: string | null;
  aspectClass: string;
  /** Short overlay caption (section or kind); null renders none. */
  caption?: string | null;
}

/**
 * M6A home media rule: owner outputs first, then owner showcase, then
 * fixture stills. The manifest resolver already filters to non-synthetic
 * origins, so sections with real media render zero synthetic plates, and
 * sections with nothing collapse (callers render null on an empty list).
 */
const KIND_MATCH: Readonly<Record<HomeMediaSection, readonly string[]>> = {
  image: ["image"],
  video: ["video"],
  audio: ["audio", "music", "voice", "sfx"],
  cinematic: ["video"],
  marketing: ["image", "video"],
  characters: ["image"],
};

export function homeSectionTiles(section: HomeMediaSection, assets: readonly StudioRecentAsset[]): HomeMediaTile[] {
  const needles = KIND_MATCH[section];
  const owner = assets.filter((asset) => needles.some((needle) => asset.kind.toLowerCase().includes(needle)));
  const tiles: HomeMediaTile[] = owner.flatMap((asset) =>
    asset.thumbnailUrl
      ? [{ key: `asset:${asset.id}`, title: asset.title, href: null, poster: asset.thumbnailUrl, aspectClass: "aspect-[4/3]" }]
      : [],
  );
  for (const media of homeSectionMedia(section)) {
    tiles.push({
      key: `manifest:${media.id}`,
      title: media.title,
      href: null,
      poster: media.poster,
      aspectClass: aspectClassFor(media),
    });
  }
  return tiles;
}

/** Sections whose curated stills feed the hero collage, in collage order. */
const FEATURED_SECTIONS: readonly HomeMediaSection[] = ["cinematic", "image", "marketing"];

/**
 * Final polish — the hero collage: one curated (non-synthetic) still per
 * featured section, each linking to the tool that makes that kind of work.
 * Owner outputs never enter the collage; they belong to recent work.
 */
export function homeFeaturedTiles(projectId: string | null): HomeMediaTile[] {
  const seen = new Set<string>();
  const tiles: HomeMediaTile[] = [];
  for (const section of FEATURED_SECTIONS) {
    const media = homeSectionMedia(section).find((entry) => !seen.has(entry.id));
    if (!media) continue;
    seen.add(media.id);
    tiles.push({
      key: `manifest:${media.id}`,
      title: media.title,
      href: homeSectionViewAll(section, projectId),
      poster: media.poster,
      aspectClass: aspectClassFor(media),
      caption: homeSectionTitle(section),
    });
  }
  return tiles;
}

function aspectClassFor(media: ResolvedLabMedia): string {
  switch (media.aspectRatio) {
    case "16/9":
      return "aspect-video";
    case "21/9":
      return "aspect-[21/9]";
    case "4/5":
      return "aspect-[4/5]";
    case "9/16":
      return "aspect-[9/16]";
    case "3/2":
      return "aspect-[3/2]";
    case "1/1":
      return "aspect-square";
    default:
      return "aspect-[4/3]";
  }
}

/**
 * The one media tile. `fill` drops the aspect box so a grid cell sizes it;
 * the poster crops to cover. A caption chip sits on a bottom scrim, and
 * linked tiles lift on hover with the Studio focus ring.
 */
export function HomeMediaFigure({ tile, eager = false, fill = false }: { tile: HomeMediaTile; eager?: boolean; fill?: boolean }) {
  if (!tile.poster) return null;
  const figure = (
    <figure className={`relative m-0 w-full overflow-hidden rounded-[14px] bg-[var(--bg-inset)] ${fill ? "h-full" : tile.aspectClass}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- manifest/asset stills are plain images, not optimized uploads */}
      <img
        src={tile.poster}
        alt={tile.title}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
      />
      {tile.caption ? (
        <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 via-black/15 to-transparent px-3 pb-2.5 pt-8">
          <span className="rounded-[6px] bg-black/45 px-1.5 py-0.5 text-[10.5px] font-medium text-white backdrop-blur-sm">{tile.caption}</span>
        </figcaption>
      ) : null}
    </figure>
  );
  if (!tile.href) return figure;
  return (
    <Link href={tile.href} aria-label={tile.caption ? `${tile.title} — open ${tile.caption}` : tile.title} className={`group block min-h-[44px] rounded-[14px] ${fill ? "h-full" : ""} ${STUDIO_FOCUS_RING_CLASS}`}>
      {figure}
    </Link>
  );
}

/**
 * Hero collage: curated stills in grid cells that own the geometry, so the
 * crops always meet on the same edges.
 */
export function HomeHeroCollage({ tiles }: { tiles: readonly HomeMediaTile[] }) {
  if (tiles.length === 0) return null;
  const [lead, ...rest] = tiles;
  const supporting = rest.slice(0, 2);
  // Below xl the collage sits under the composer as one even row; from xl
  // it is the hero's right column: a wide lead over two supporting stills.
  return (
    <div data-testid="studio-home-hero-media" className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2 sm:gap-2.5 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
      <div className={`aspect-[4/5] sm:aspect-[4/3] ${supporting.length === 0 ? "col-span-3" : "xl:col-span-2 xl:aspect-[16/8.6]"}`}>
        <HomeMediaFigure tile={lead!} eager fill />
      </div>
      {supporting.map((tile) => (
        <div key={tile.key} className={`aspect-[4/5] sm:aspect-[4/3] xl:aspect-[4/3.3] ${supporting.length === 1 ? "col-span-2 xl:col-span-2" : ""}`}>
          <HomeMediaFigure tile={tile} eager fill />
        </div>
      ))}
    </div>
  );
}

export function homeSectionTitle(section: HomeMediaSection): string {
  return HOME_MEDIA_SECTIONS[section].title;
}

export function homeSectionViewAll(section: HomeMediaSection, projectId: string | null): string {
  const href = HOME_MEDIA_SECTIONS[section].viewAllHref;
  return projectId ? `${href}?projectId=${encodeURIComponent(projectId)}` : href;
}
