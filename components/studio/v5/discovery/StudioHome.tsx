"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAudioTool } from "../create/audio/audio-tool-bindings";
import { getCreateTool } from "../create/tool-definitions";
import { StudioErrorState } from "../shell";
import { StudioNavIcon } from "../shell/studio-nav-icons";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { useStudioIdentity } from "../../studio-project-scope";
import { parseAssetsResponse } from "../shell/project-context-model";
import type { StudioRecentAsset } from "../shell/types";
import type { HomeMediaSection } from "@/lib/studio-v5/media-manifest";
import { sectionItems, showcaseForApp, type StudioShowcaseItem } from "@/lib/studio-v5/showcase-feed";
import { curatedEntries } from "./AppsLibrary";
import { CURATED_TEMPLATES } from "./TemplatesLibrary";
import { useCatalogProjection } from "./useCatalogProjection";
import { HomeMediaFigure, homeSectionTiles, homeSectionTitle, homeSectionViewAll } from "./StudioHomeMedia";
import { APP_MOTIF, APP_STEPS, HomeFeatureCard, HomeRail, HomeSectionHead, RAIL_ITEM_CLASS, TEMPLATE_MOTIF, type HomeToolTile } from "./StudioHomeCards";
import { StudioHomePrompt, type HomePromptToolId, HOME_PROMPT_INPUT_ID } from "./StudioHomePrompt";
import {
  AppDirectoryCard,
  AppSpotlight,
  CapabilityTiles,
  FeatureRail,
  FlagshipPanel,
  ModelSpotlight,
  SpecializedBand,
  type CapabilityTile,
  type FeatureRailEntry,
  type KeyArt,
} from "./showcase/DiscoveryModules";
import { ShowcaseMosaic } from "./showcase/ShowcaseMosaic";
import { useShowcaseFeed } from "./showcase/useShowcaseFeed";

const INSPIRATIONS: ReadonlyArray<{ tool: HomePromptToolId; label: string; prompt: string; icon: string }> = [
  { tool: "image", label: "Blue-hour lighthouse", prompt: "A lighthouse at blue hour, medium format, soft grain", icon: "image" },
  { tool: "video", label: "Fog dolly", prompt: "Slow dolly through morning fog, 5 seconds", icon: "video" },
  { tool: "edit", label: "Clean the crowd", prompt: "Remove the background crowd, keep the subject", icon: "edit" },
  { tool: "3d", label: "Fox figurine", prompt: "A low-poly fox figurine, turntable-ready", icon: "cube" },
  { tool: "voice", label: "Launch narrator", prompt: "A warm narrator voice for a product launch", icon: "voice" },
  { tool: "music", label: "Dusty lo-fi loop", prompt: "Lo-fi loop, 90 bpm, dusty keys", icon: "music" },
  { tool: "sfx", label: "Tin-roof rain", prompt: "Rain on a tin roof, distant thunder", icon: "sfx" },
];

/**
 * Quick-create tools: copy is presentation; destinations come from the
 * tool registries, and a tool the registries do not know is not shown.
 */
const VISUAL_TOOLS: readonly Omit<HomeToolTile, "href">[] = [
  { id: "image", title: "Image", purpose: "Text to image", motif: "image", icon: "image" },
  { id: "video", title: "Video", purpose: "Text or still to video", motif: "video", icon: "video" },
  { id: "edit", title: "Edit", purpose: "Prompt + mask edits", motif: "edit", icon: "edit" },
  { id: "3d", title: "3D", purpose: "Text to mesh", motif: "3d", icon: "cube" },
];

const AUDIO_TOOLS: readonly Omit<HomeToolTile, "href">[] = [
  { id: "voice", title: "Voice", purpose: "Script to speech", motif: "voice", icon: "voice" },
  { id: "music", title: "Music", purpose: "Describe a track", motif: "music", icon: "music" },
  { id: "sfx", title: "Sound effects", purpose: "Any sound", motif: "sfx", icon: "sfx" },
  { id: "transcribe", title: "Transcribe", purpose: "Audio to text", motif: "transcribe", icon: "transcribe" },
  { id: "dub", title: "Dub", purpose: "Translate speech", motif: "dub", icon: "dubbing" },
  { id: "changer", title: "Change voice", purpose: "Re-voice audio", motif: "changer", icon: "changer" },
];

const MEDIA_SECTIONS: readonly HomeMediaSection[] = ["image", "video", "audio", "cinematic", "marketing", "characters"];

/** Explore-more index — an in-product capability map over canonical routes. */
const EXPLORE_GROUPS: ReadonlyArray<{ label: string; links: ReadonlyArray<{ label: string; href: string }> }> = [
  {
    label: "Create",
    links: [
      { label: "Image", href: "/studio/create/image" },
      { label: "Video", href: "/studio/create/video" },
      { label: "Edit", href: "/studio/create/edit" },
      { label: "3D", href: "/studio/create/3d" },
      { label: "Voice", href: "/studio/create/voice" },
      { label: "Music", href: "/studio/create/music" },
      { label: "Sound effects", href: "/studio/create/sfx" },
      { label: "Transcribe", href: "/studio/create/transcribe" },
      { label: "Dub", href: "/studio/create/dub" },
      { label: "Change voice", href: "/studio/create/changer" },
    ],
  },
  {
    label: "Apps",
    links: [
      { label: "Cinema Studio", href: "/studio/pro/cinema" },
      { label: "Marketing Studio", href: "/studio/marketing" },
      { label: "AI Influencer", href: "/studio/influencer" },
      { label: "Canvas", href: "/studio/workflows" },
      { label: "Creative Agent", href: "/studio/agent" },
      { label: "Voice Agents", href: "/studio/voice-agents" },
      { label: "Timelines", href: "/studio/pro/video" },
      { label: "All apps", href: "/studio/apps" },
    ],
  },
  {
    label: "Discover",
    links: [
      { label: "Explore", href: "/studio/explore" },
      { label: "Models", href: "/studio/models" },
      { label: "Templates", href: "/studio/templates" },
      { label: "Voices", href: "/studio/voices" },
      { label: "Characters", href: "/studio/identities/characters" },
      { label: "Products", href: "/studio/identities/products" },
      { label: "Brands", href: "/studio/identities/brands" },
    ],
  },
  {
    label: "Work",
    links: [
      { label: "Projects", href: "/studio/work/projects" },
      { label: "Assets", href: "/studio/work/assets" },
      { label: "Jobs", href: "/studio/work/jobs" },
      { label: "Reviews", href: "/studio/work/reviews" },
      { label: "Exports", href: "/studio/exports" },
      { label: "Settings", href: "/studio/settings" },
    ],
  },
];

function registryRoute(id: string): string | null {
  const tool = getCreateTool(id) ?? getAudioTool(id);
  return tool ? tool.route : null;
}

function withProject(href: string, projectId: string | null): string {
  return projectId ? `${href}?projectId=${encodeURIComponent(projectId)}` : href;
}

function keyArt(items: readonly StudioShowcaseItem[], id: string, fallback: KeyArt): KeyArt {
  const item = items.find((entry) => entry.id === id);
  return item ? { kind: "item", item } : fallback;
}

/**
 * Discovery home — a long editorial feed modelled on premium AI-media
 * discovery: composer → quick tools → what's new → capabilities → flagship
 * → video wall → app spotlight → video models → image wall → app spotlight
 * → specialized band → templates → all apps → explore index. Every section
 * renders at its full slot count from the discovery slot catalog: final
 * media first, placeholder media (marked in data) holding the rest until
 * final R2 media replaces it.
 */
export function StudioHome() {
  const { identity } = useStudioIdentity();
  const projectId = identity.projectId;
  const [toolId, setToolId] = useState<HomePromptToolId>("image");
  const [prompt, setPrompt] = useState("");
  const [assets, setAssets] = useState<readonly StudioRecentAsset[]>([]);
  const [assetsState, setAssetsState] = useState<"loading" | "ready" | "empty" | "error" | "setup">("loading");
  const [reload, setReload] = useState(0);
  const catalog = useCatalogProjection(projectId);
  const { items } = useShowcaseFeed();

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/studio/v1/assets?projectId=${encodeURIComponent(projectId)}&limit=48`, { cache: "no-store" });
        const parsed = parseAssetsResponse(await response.json());
        if (cancelled) return;
        setAssets(parsed.assets);
        setAssetsState(parsed.state === "ready" ? "ready" : parsed.state === "empty" ? "empty" : parsed.state === "setup" ? "setup" : "error");
      } catch {
        if (cancelled) return;
        setAssets([]);
        setAssetsState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reload]);

  // Without a project scope there is no work to show, by derivation —
  // never fetched and never fabricated.
  const visibleAssets = useMemo(() => (projectId ? assets : []), [projectId, assets]);
  const visibleAssetsState = projectId ? assetsState : "setup";
  const recent = useMemo(() => visibleAssets.filter((asset) => asset.thumbnailUrl).slice(0, 10), [visibleAssets]);
  const tallies = catalog.projection?.tallies ?? null;

  // Every visual section renders at its full slot count; placeholders hold
  // the geometry until final showcase media replaces them (discovery-media.ts).
  const videoWall = useMemo(() => sectionItems(items, "home-video"), [items]);
  const imageWall = useMemo(() => sectionItems(items, "home-image"), [items]);
  const productBand = useMemo(() => sectionItems(items, "specialized-product"), [items]);
  const apps = useMemo(() => curatedEntries(), []);
  const appHref = (id: string) => apps.find((app) => app.id === id)?.href ?? "/studio/apps";

  const toolTiles = (tools: readonly Omit<HomeToolTile, "href">[]): HomeToolTile[] =>
    tools.flatMap((tool) => {
      const route = registryRoute(tool.id);
      return route ? [{ ...tool, href: withProject(route, projectId) }] : [];
    });

  const heroArt = keyArt(items, "still-hero", { kind: "art", motif: "cinema" });
  const productArt = keyArt(items, "still-product", { kind: "art", motif: "marketing" });
  const portraitArt = keyArt(items, "still-portrait", { kind: "art", motif: "influencer" });

  const featureRail: FeatureRailEntry[] = [
    { id: "cinema", title: "Cinema Studio", line: "Scenes, shots and takes on one board.", href: "/studio/pro/cinema", art: heroArt },
    { id: "marketing", title: "Marketing Studio", line: "One brief, campaign-ready variants.", href: "/studio/marketing", art: productArt },
    { id: "influencer", title: "AI Influencer", line: "Consistent characters across every post.", href: "/studio/influencer", art: portraitArt },
    { id: "animate", title: "Animate image", line: "Bring any still to life as a clip.", href: appHref("image-to-video"), art: keyArt(items, "video-19", { kind: "art", motif: "video" }) },
    { id: "canvas", title: "Canvas", line: "Chain tools into one runnable graph.", href: "/studio/workflows", art: keyArt(items, "image-21", { kind: "art", motif: "canvas", steps: ["Image", "Edit", "Animate"] }) },
    { id: "agent", title: "Creative Agent", line: "Plans, approvals and runs in your project.", href: "/studio/agent", art: keyArt(items, "video-17", { kind: "art", motif: "agent" }) },
  ];

  const capabilities: CapabilityTile[] = [
    { id: "auto", title: "Ethen Auto", line: "Routes each job to a qualified model", icon: "sparkle", tag: "Auto", href: withProject("/studio/create/image", projectId) },
    { id: "video", title: "Video generation", line: "Text or still to a shot", icon: "video", tag: "Video", href: withProject("/studio/create/video", projectId) },
    { id: "image", title: "Image generation", line: "Stills, edits and variations", icon: "image", tag: "Image", href: withProject("/studio/create/image", projectId) },
    { id: "audio", title: "Voice & music", line: "Speech, scores and sound", icon: "audio", tag: "Audio", href: withProject("/studio/create/voice", projectId) },
    { id: "cinema", title: "Cinema Studio", line: "Direct scenes and takes", icon: "cinema", tag: "App", href: "/studio/pro/cinema" },
    { id: "marketing", title: "Marketing Studio", line: "Brief to campaign", icon: "marketing", tag: "App", href: "/studio/marketing" },
  ];

  const cinemaWall = sectionItems(items, "flagship-cinema");

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-12 px-4 pb-20 pt-5 sm:px-6 sm:pt-6 lg:px-8">
      <h1 tabIndex={-1} className="sr-only">
        Ethen Studio
      </h1>

      {/* 1. Create composer */}
      <StudioHomePrompt projectId={projectId} toolId={toolId} prompt={prompt} onToolChange={setToolId} onPromptChange={setPrompt}>
        <section aria-label="Inspirations" className="mt-4">
          <h2 className="sr-only">Start from an idea</h2>
          <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] max-lg:[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] lg:flex-wrap [&::-webkit-scrollbar]:hidden">
            {INSPIRATIONS.map((idea) => (
              <li key={idea.label} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setToolId(idea.tool);
                    setPrompt(idea.prompt);
                    document.getElementById(HOME_PROMPT_INPUT_ID)?.focus();
                  }}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-3 text-[12px] text-[var(--text-secondary)] transition-colors duration-150 hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] pointer-fine:min-h-[32px] ${STUDIO_FOCUS_RING_CLASS}`}
                >
                  <span aria-hidden="true" className="text-[var(--text-tertiary)]">
                    <StudioNavIcon name={idea.icon} size={13} />
                  </span>
                  {idea.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </StudioHomePrompt>

      {/* 2. Quick-create tools (compact) */}
      <section aria-label="Featured tools" className="!mt-4">
        <h2 className="sr-only">Quick create</h2>
        <ul className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(5,minmax(0,1fr))] 2xl:grid-cols-[repeat(10,minmax(0,1fr))]">
          {[...toolTiles(VISUAL_TOOLS), ...toolTiles(AUDIO_TOOLS)].map((tool) => (
            <li key={tool.id}>
              <Link
                href={tool.href}
                className={`group flex h-full min-h-[44px] items-center gap-2.5 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] ${STUDIO_FOCUS_RING_CLASS}`}
              >
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-[var(--bg-elevated)] text-[var(--text-primary)] group-hover:bg-[var(--studio-bg-selected)]">
                  <StudioNavIcon name={tool.icon} size={14} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium text-[var(--text-primary)]">{tool.title}</span>
                  <span className="block truncate text-[11px] text-[var(--text-tertiary)]">{tool.purpose}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Owner work: shown only when there is real work (or a load error). */}
      {visibleAssetsState === "ready" && recent.length > 0 ? (
        <section aria-label="Your recent creations">
          <HomeSectionHead title="Your recent creations" action={{ label: "View all", href: withProject("/studio/work/assets", projectId) }} />
          <HomeRail label="Recent creations">
            {recent.map((asset) => (
              <li key={asset.id} className="shrink-0 snap-start basis-[46%] sm:basis-[30%] lg:basis-[calc((100%-48px)/5)]">
                <HomeMediaFigure tile={{ key: asset.id, title: asset.title, href: withProject("/studio/work/assets", projectId), poster: asset.thumbnailUrl ?? null, aspectClass: "aspect-[4/5]", caption: asset.kind }} />
              </li>
            ))}
          </HomeRail>
        </section>
      ) : visibleAssetsState === "error" ? (
        <StudioErrorState title="Couldn’t load your work" description="Recent creations are unavailable right now." retryLabel="Retry" onRetry={() => setReload((count) => count + 1)} compact />
      ) : null}
      {MEDIA_SECTIONS.map((section) => {
        // Owner outputs per modality (curated stills live in the showcase feed).
        const tiles = homeSectionTiles(section, visibleAssets).filter((tile) => tile.key.startsWith("asset:")).slice(0, 8);
        if (tiles.length === 0) return null;
        return (
          <section key={section} aria-label={homeSectionTitle(section)}>
            <HomeSectionHead title={homeSectionTitle(section)} action={{ label: "View all", href: homeSectionViewAll(section, projectId) }} />
            <HomeRail label={homeSectionTitle(section)}>
              {tiles.map((tile) => (
                <li key={tile.key} className={RAIL_ITEM_CLASS}>
                  <HomeMediaFigure tile={{ ...tile, href: homeSectionViewAll(section, projectId) }} />
                </li>
              ))}
            </HomeRail>
          </section>
        );
      })}

      {/* 3. What's new rail */}
      <FeatureRail entries={featureRail} />

      {/* 4. Capability tiles */}
      <CapabilityTiles tiles={capabilities} />

      {/* 5. Flagship feature panel */}
      <FlagshipPanel
        label="Cinema Studio feature"
        eyebrow="Ethen Cinema Studio"
        title="Direct every shot"
        description="Break a scene into shots, generate takes on qualified video models, and review the cut on one board inside your project."
        primary={{ label: "Open Cinema Studio", href: "/studio/pro/cinema" }}
        secondary={{ label: "Explore cinematic", href: "/studio/explore?type=video&category=cinematic" }}
        art={heroArt}
        collage={cinemaWall}
      />

      {/* 6. Video showcase mosaic */}
      <section aria-label="Video showcase">
        <HomeSectionHead title="Video showcase" lead="Made in Ethen Studio. Hover to preview, open to remix." />
        <ShowcaseMosaic items={videoWall} kind="video" projectId={projectId} label="Video showcase" cap={{ label: "View all video", href: "/studio/explore?type=video" }} />
      </section>

      {/* 7. App spotlight #1 */}
      <AppSpotlight
        appTitle="Marketing Studio"
        description="Turn one product brief into campaign-ready images and clips, with review before anything ships."
        href={appHref("marketing-studio")}
        examplesHref="/studio/explore?type=video&category=advertising"
        steps={APP_STEPS["marketing-studio"] ?? []}
        outputs={sectionItems(items, "spotlight-marketing")}
        art={productArt}
        projectId={projectId}
      />

      {/* 8. Video model spotlight */}
      <section aria-label="Model discovery">
        <ModelSpotlight
          title="Video models to try"
          lead="Families in this project's catalog; Try opens the video tool."
          taskPrefix="video."
          motif="video"
          projectId={projectId}
          items={items}
          viewAllHref="/studio/models"
          catalog={catalog}
        />
      </section>

      {/* 9. Image inspiration mosaic */}
      <section aria-label="Image inspiration">
        <HomeSectionHead title="Image inspiration" lead="Editorial, product and character stills." />
        <ShowcaseMosaic items={imageWall} kind="image" projectId={projectId} label="Image inspiration" cap={{ label: "Explore images", href: "/studio/explore?type=images" }} />
      </section>

      {/* 10. App spotlight #2 */}
      <AppSpotlight
        appTitle="AI Influencer"
        description="Build a consistent character once, then generate on-brand scenes and vertical clips around them."
        href={appHref("ai-influencer")}
        examplesHref="/studio/explore?type=video&category=character"
        steps={APP_STEPS["ai-influencer"] ?? []}
        outputs={sectionItems(items, "spotlight-influencer")}
        art={portraitArt}
        projectId={projectId}
      />

      {/* 11. Specialized media band */}
      <SpecializedBand
        label="Product advertising"
        eyebrow="Product advertising"
        title="Same product, every format"
        description="Packshots, lifestyle frames and vertical ads from one product reference."
        cta={{ label: "Start a product ad", href: "/studio/marketing" }}
        items={productBand}
        projectId={projectId}
      />

      {/* 12. Templates */}
      <section aria-label="Templates">
        <HomeSectionHead title="Templates" lead="Starting points that open a real workflow." action={{ label: "View all", href: "/studio/templates" }} />
        <HomeRail label="Curated templates">
          {CURATED_TEMPLATES.map((template) => (
            <li key={template.id} className={RAIL_ITEM_CLASS}>
              <HomeFeatureCard title={template.title} description={template.description} href={template.href} motif={TEMPLATE_MOTIF[template.id] ?? "template"} steps={APP_STEPS[template.id]} tags={[template.versionLabel, template.rightsLabel]} />
            </li>
          ))}
        </HomeRail>
      </section>

      {/* 13. All apps */}
      <section aria-label="Apps">
        <HomeSectionHead title="All apps" lead="Guided productions that chain several tools." action={{ label: "Open apps", href: "/studio/apps" }} />
        <ul className="grid grid-cols-[repeat(1,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
          {apps.map((app) => (
            <li key={app.id}>
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
          ))}
        </ul>
      </section>

      {/* 14. Explore-more index */}
      <section aria-label="Explore more" className="border-t border-[var(--border-subtle)] pt-10">
        <h2 className="text-center text-[20px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[24px]">Explore more in Studio</h2>
        <div className="mx-auto mt-6 flex max-w-[1080px] flex-col gap-4">
          {EXPLORE_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-5">
              <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)] sm:w-24 sm:pt-2 sm:text-right">{group.label}</p>
              <ul className="flex flex-1 flex-wrap gap-1.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`inline-flex min-h-[44px] items-center rounded-[8px] bg-[var(--bg-surface)] px-3 text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] pointer-fine:min-h-[32px] ${STUDIO_FOCUS_RING_CLASS}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[12px] text-[var(--text-tertiary)]" role="status">
        {tallies ? `${tallies.families} model families · ${tallies.endpoints} endpoints · ${tallies.executable} ready to run` : "Catalog summary unavailable."}
      </p>

    </div>
  );
}
