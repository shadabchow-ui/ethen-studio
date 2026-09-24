"use client";

/**
 * /studio/explore — the dense discovery surface. One route, the view held
 * in the URL (`?type=` video | images | apps | templates | models, absent =
 * Featured; `&category=` for video/images), so every view deep-links and
 * round-trips through history. Tabs and chips are plain links.
 */

import * as React from "react";
import Link from "next/link";
import { StudioEmptyState } from "../../shell";
import { StudioPageHeader } from "../../shell/PageHeader";
import { STUDIO_FOCUS_RING_CLASS } from "../../shell/tokens";
import { useStudioIdentity } from "../../../studio-project-scope";
import { useCatalogProjection } from "../useCatalogProjection";
import { StudioModelsBrowse } from "../ModelsBrowse";
import { curatedEntries } from "../AppsLibrary";
import { CURATED_TEMPLATES } from "../TemplatesLibrary";
import { APP_MOTIF, APP_STEPS, HomeFeatureCard, HomeRail, HomeSectionHead, RAIL_ITEM_CLASS, TEMPLATE_MOTIF } from "../StudioHomeCards";
import {
  EXPLORE_PAGE_SIZE,
  IMAGE_CATEGORIES,
  VIDEO_CATEGORIES,
  populatedCategories,
  sectionItems,
  showcaseForApp,
  showcaseImages,
  showcaseInCategory,
  showcaseVideos,
  type ShowcaseCategory,
  type StudioShowcaseItem,
} from "../../../../../lib/studio-v5/showcase-feed";
import { AppDirectoryCard, AppSpotlight, ModelSpotlight, type KeyArt } from "../showcase/DiscoveryModules";
import { ShowcaseMosaic } from "../showcase/ShowcaseMosaic";
import { useShowcaseFeed } from "../showcase/useShowcaseFeed";

export type ExploreView = "featured" | "video" | "images" | "apps" | "templates" | "models";

const TABS: readonly { id: ExploreView; label: string; href: string }[] = [
  { id: "featured", label: "Featured", href: "/studio/explore" },
  { id: "video", label: "Video", href: "/studio/explore?type=video" },
  { id: "images", label: "Images", href: "/studio/explore?type=images" },
  { id: "apps", label: "Apps", href: "/studio/explore?type=apps" },
  { id: "templates", label: "Templates", href: "/studio/explore?type=templates" },
  { id: "models", label: "Models", href: "/studio/explore?type=models" },
];

export function exploreViewOf(type: string | undefined): ExploreView {
  return TABS.some((tab) => tab.id === type) && type !== "featured" ? (type as ExploreView) : "featured";
}

function pillClass(active: boolean): string {
  return `inline-flex min-h-[44px] shrink-0 items-center rounded-[8px] border px-3.5 text-[12.5px] leading-none transition-colors pointer-fine:min-h-[32px] ${
    active
      ? "border-[var(--border-default)] bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)]"
      : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
  } ${STUDIO_FOCUS_RING_CLASS}`;
}

function chipClass(active: boolean): string {
  return `inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-3 text-[12px] transition-colors pointer-fine:min-h-[30px] ${
    active
      ? "border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
      : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
  } ${STUDIO_FOCUS_RING_CLASS}`;
}

const ROW_CLASS = "-mx-1 flex items-center gap-1 overflow-x-auto overscroll-x-contain px-1 py-1 [scrollbar-width:none] max-md:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [&::-webkit-scrollbar]:hidden";

export function ExploreRoute({ type, category }: { type?: string; category?: string }) {
  const view = exploreViewOf(type);
  const { identity } = useStudioIdentity();
  const projectId = identity.projectId;
  const { items } = useShowcaseFeed();

  const mediaItems = view === "video" ? showcaseVideos(items) : view === "images" ? showcaseImages(items) : [];
  const categories = view === "video" ? populatedCategories(mediaItems, VIDEO_CATEGORIES) : view === "images" ? populatedCategories(mediaItems, IMAGE_CATEGORIES) : [];
  // An unpopulated category in the URL falls back to All.
  const activeCategory = categories.some((entry) => entry.id === category) ? (category as ShowcaseCategory) : null;
  const baseHref = view === "video" ? "/studio/explore?type=video" : "/studio/explore?type=images";

  return (
    <div className="space-y-5" data-testid="studio-explore">
      <StudioPageHeader eyebrow="Discover" routeMarker="/studio/explore" title="Explore" description="Creations, apps, templates and models you can start from." />

      <div className="sticky top-0 z-20 -mx-4 space-y-1 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/95 px-4 pb-2 pt-1 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <nav aria-label="Explore views" className={ROW_CLASS}>
          {TABS.map((tab) => (
            <Link key={tab.id} href={tab.href} scroll={false} aria-current={tab.id === view ? "page" : undefined} className={pillClass(tab.id === view)}>
              {tab.label}
            </Link>
          ))}
        </nav>
        {categories.length > 0 ? (
          <nav aria-label="Categories">
            <ul className={ROW_CLASS}>
              <li>
                <Link href={baseHref} scroll={false} aria-current={activeCategory === null ? "page" : undefined} className={chipClass(activeCategory === null)}>
                  All
                </Link>
              </li>
              {categories.map((entry) => (
                <li key={entry.id}>
                  <Link href={`${baseHref}&category=${entry.id}`} scroll={false} aria-current={activeCategory === entry.id ? "page" : undefined} className={chipClass(activeCategory === entry.id)}>
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>

      {view === "featured" ? <FeaturedView items={items} projectId={projectId} /> : null}
      {view === "video" || view === "images" ? (
        <MediaWall key={`${view}:${activeCategory ?? "all"}`} kind={view} items={showcaseInCategory(mediaItems, activeCategory)} projectId={projectId} />
      ) : null}
      {view === "apps" ? <AppsView items={items} /> : null}
      {view === "templates" ? <TemplatesView /> : null}
      {view === "models" ? (
        <div className="space-y-4">
          <p className="text-[12.5px] text-[var(--text-secondary)]">
            Model families in this project&rsquo;s catalog. Cataloged is not executable.{" "}
            <Link href="/studio/models" className={`underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}>
              Open the full catalog
            </Link>
          </p>
          <StudioModelsBrowse />
        </div>
      ) : null}

    </div>
  );
}

/* ── Video / Images wall with explicit pagination ─────────────────────── */

function MediaWall({ kind, items, projectId }: { kind: "video" | "images"; items: readonly StudioShowcaseItem[]; projectId: string | null }) {
  const pageSize = EXPLORE_PAGE_SIZE[kind];
  const [count, setCount] = React.useState<number>(pageSize);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  if (items.length === 0) {
    return (
      <StudioEmptyState
        title="Nothing in this category yet"
        description="Try another category, or start something of your own."
        actionLabel={kind === "video" ? "Create a video" : "Create an image"}
        actionHref={kind === "video" ? "/studio/create/video" : "/studio/create/image"}
      />
    );
  }
  const shown = items.slice(0, count);
  return (
    <div ref={listRef} className="space-y-6">
      <ShowcaseMosaic items={shown} kind={kind === "video" ? "video" : "image"} projectId={projectId} label={kind === "video" ? "Video showcase" : "Image inspiration"} eagerCount={4} />
      <div className="flex justify-center">
        {count < items.length ? (
          <button
            type="button"
            onClick={() => {
              const firstNew = count;
              setCount((value) => value + pageSize);
              requestAnimationFrame(() => {
                const cells = listRef.current?.querySelectorAll<HTMLElement>("[data-showcase-cell] a[aria-label^='Open ']");
                cells?.[firstNew]?.focus();
              });
            }}
            className={`inline-flex min-h-[44px] items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] px-5 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--studio-bg-selected)] pointer-fine:min-h-[36px] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Show more
          </button>
        ) : (
          <p className="text-[12px] text-[var(--text-tertiary)]">You&rsquo;ve reached the end of the showcase.</p>
        )}
      </div>
    </div>
  );
}

/* ── Featured: interleaved, intentionally not one homogeneous grid ───── */

function FeaturedView({ items, projectId }: { items: readonly StudioShowcaseItem[]; projectId: string | null }) {
  const catalog = useCatalogProjection(projectId);
  const art = (id: string, motif: KeyArt & { kind: "art" }): KeyArt => {
    const item = items.find((entry) => entry.id === id);
    return item ? { kind: "item", item } : motif;
  };
  const apps = curatedEntries();
  const appHref = (id: string) => apps.find((app) => app.id === id)?.href ?? "/studio/apps";
  const videoWall = sectionItems(items, "home-video");
  const imageWall = sectionItems(items, "home-image");
  const shownIds = new Set([...videoWall, ...imageWall].map((item) => item.id));
  const more = items.filter((item) => !shownIds.has(item.id)).slice(0, 24);
  return (
    <div className="space-y-12">
      <section aria-label="Video showcase">
        <HomeSectionHead title="Video showcase" />
        <ShowcaseMosaic items={videoWall} kind="video" projectId={projectId} label="Video showcase" cap={{ label: "View all video", href: "/studio/explore?type=video" }} eagerCount={2} />
      </section>
      <AppSpotlight
        appTitle="Cinema Studio"
        description="Scenes broken into shots, takes generated on qualified video models, reviewed on one board."
        href="/studio/pro/cinema"
        examplesHref="/studio/explore?type=video&category=cinematic"
        steps={APP_STEPS["cinema-studio"] ?? []}
        outputs={sectionItems(items, "flagship-cinema")}
        art={art("still-hero", { kind: "art", motif: "cinema" })}
        projectId={projectId}
      />
      <section aria-label="Image inspiration">
        <HomeSectionHead title="Image inspiration" />
        <ShowcaseMosaic items={imageWall} kind="image" projectId={projectId} label="Image inspiration" cap={{ label: "Explore images", href: "/studio/explore?type=images" }} />
      </section>
      <section aria-label="Models to try">
        <ModelSpotlight title="Video models to try" lead="Families in this project's catalog." taskPrefix="video." motif="video" projectId={projectId} items={items} viewAllHref="/studio/explore?type=models" catalog={catalog} />
      </section>
      <TemplatesRail />
      <AppSpotlight
        appTitle="Marketing Studio"
        description="One product brief, campaign-ready images and clips, with review before anything ships."
        href={appHref("marketing-studio")}
        examplesHref="/studio/explore?type=video&category=advertising"
        steps={APP_STEPS["marketing-studio"] ?? []}
        outputs={sectionItems(items, "spotlight-marketing")}
        art={art("still-product", { kind: "art", motif: "marketing" })}
        projectId={projectId}
      />
      <section aria-label="More creations">
        <HomeSectionHead title="More creations" />
        <ShowcaseMosaic items={more} kind="video" projectId={projectId} label="More creations" />
      </section>
    </div>
  );
}

function TemplatesRail() {
  return (
    <section aria-label="Templates">
      <HomeSectionHead title="Templates" action={{ label: "All templates", href: "/studio/explore?type=templates" }} />
      <HomeRail label="Curated templates">
        {CURATED_TEMPLATES.map((template) => (
          <li key={template.id} className={RAIL_ITEM_CLASS}>
            <HomeFeatureCard title={template.title} description={template.description} href={template.href} motif={TEMPLATE_MOTIF[template.id] ?? "template"} steps={APP_STEPS[template.id]} tags={[template.versionLabel, template.rightsLabel]} />
          </li>
        ))}
      </HomeRail>
    </section>
  );
}

/* ── Apps: grouped, output-first where real output exists ────────────── */

const APP_GROUPS: readonly { label: string; ids: readonly string[] }[] = [
  { label: "Image workflows", ids: ["create-image"] },
  { label: "Video workflows", ids: ["text-to-video", "image-to-video"] },
  { label: "Marketing", ids: ["marketing-studio"] },
  { label: "Character & influencer", ids: ["ai-influencer"] },
  { label: "Production", ids: ["cinema-studio"] },
];

function AppsView({ items }: { items: readonly StudioShowcaseItem[] }) {
  const apps = curatedEntries();
  const withOutput = apps.filter((app) => showcaseForApp(items, app.id).length > 0);
  const groups = [{ label: "Featured", ids: withOutput.map((app) => app.id) }, ...APP_GROUPS].filter((group) => group.ids.length > 0);
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <HomeSectionHead title={group.label} />
          <ul className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
            {group.ids.map((id) => {
              const app = apps.find((entry) => entry.id === id);
              if (!app) return null;
              return (
                <li key={id}>
                  <AppDirectoryCard
                    title={app.title}
                    description={app.description}
                    href={app.href}
                    steps={APP_STEPS[app.id] ?? []}
                    tags={[app.versionLabel, app.rightsLabel]}
                    output={showcaseForApp(items, app.id)[0] ?? null}
                    art={APP_MOTIF[app.id] ?? "canvas"}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TemplatesView() {
  return (
    <ul className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
      {CURATED_TEMPLATES.map((template) => (
        <li key={template.id}>
          <HomeFeatureCard title={template.title} description={template.description} href={template.href} motif={TEMPLATE_MOTIF[template.id] ?? "template"} steps={APP_STEPS[template.id]} tags={[template.versionLabel, template.rightsLabel]} />
        </li>
      ))}
    </ul>
  );
}
