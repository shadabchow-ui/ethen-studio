"use client";

/**
 * Final polish — the home card family.
 *
 * One vocabulary for every discovery block: media tiles (real media only,
 * see StudioHomeMedia), tool tiles, app/template cards and model cards.
 * Tool, app and template cards carry *designed* artwork — line glyph
 * compositions on the charcoal scale — never imagery that could be read as
 * a generated output. Every card is a native link with the Studio focus ring.
 */

import * as React from "react";
import Link from "next/link";
import { StudioNavIcon } from "../shell/studio-nav-icons";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";

const focus = STUDIO_FOCUS_RING_CLASS;

/* ── Section chrome ─────────────────────────────────────────────────────── */

export function HomeSectionHead({
  title,
  lead,
  action,
}: {
  title: string;
  lead?: string;
  action?: { label: string; href: string } | null;
}) {
  return (
    <div className="mb-3.5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold leading-[1.3] tracking-[-0.01em] text-[var(--text-primary)] sm:text-[17px]">{title}</h2>
        {lead ? <p className="mt-0.5 text-[12.5px] leading-[1.5] text-[var(--text-tertiary)]">{lead}</p> : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className={`group inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-[8px] px-1 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--text-primary)] pointer-fine:min-h-[32px] ${focus}`}
        >
          {action.label}
          <span aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5">
            <StudioNavIcon name="chevron" size={13} />
          </span>
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Horizontal rail: native overflow scroll with snap, edge-to-edge on phones
 * (the rail bleeds into the page gutter) and a fixed column count from md.
 */
export function HomeRail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </ul>
  );
}

/** Rail item widths: ~1.3 cards on phones, 2.3 on tablets, 4 on desktop. */
export const RAIL_ITEM_CLASS = "shrink-0 snap-start basis-[76%] sm:basis-[42%] lg:basis-[calc((100%-36px)/4)]";

/* ── Designed artwork ───────────────────────────────────────────────────── */

export type HomeArtMotif =
  | "image"
  | "edit"
  | "video"
  | "3d"
  | "voice"
  | "music"
  | "sfx"
  | "transcribe"
  | "dub"
  | "changer"
  | "canvas"
  | "agent"
  | "marketing"
  | "influencer"
  | "cinema"
  | "template";

const BAR_HEIGHTS = [30, 52, 38, 70, 46, 82, 58, 40, 66, 34, 54, 26, 44, 62, 36];

/**
 * A line-art composition per motif, drawn in the text tiers over a quiet
 * radial lift. Decorative: labels on the card carry the meaning.
 */
export function HomeArt({ motif, steps, className = "" }: { motif: HomeArtMotif; steps?: readonly string[]; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden bg-[var(--bg-inset)] [background-image:radial-gradient(120%_90%_at_70%_20%,color-mix(in_srgb,var(--text-primary)_7%,transparent),transparent_60%)] ${className}`}
    >
      <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--border-subtle)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_75%_70%_at_50%_50%,black,transparent_78%)]" />
      <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {steps && steps.length > 0 ? <ChainArt steps={steps} /> : <ArtMotif motif={motif} />}
      </svg>
    </div>
  );
}

// Art tones stay below the text tiers so card labels always lead.
const S1 = "var(--text-secondary)";
const S2 = "var(--studio-text-3)";
const S3 = "var(--studio-text-4)";

/**
 * A production chain: the steps an app or template runs, as linked nodes.
 * The last node (the deliverable) carries the brighter stroke.
 */
function ChainArt({ steps }: { steps: readonly string[] }) {
  const shown = steps.slice(0, 3);
  const nodeW = 40;
  const gap = 10;
  const total = shown.length * nodeW + (shown.length - 1) * gap;
  const start = (160 - total) / 2;
  return (
    <g>
      {shown.map((step, index) => {
        const x = start + index * (nodeW + gap);
        const last = index === shown.length - 1;
        return (
          <g key={step}>
            <rect x={x} y="38" width={nodeW} height="24" rx="6" stroke={last ? S1 : S2} strokeWidth={last ? 1.3 : 1} fill={last ? "color-mix(in srgb, var(--text-primary) 4%, transparent)" : "none"} />
            <text x={x + nodeW / 2} y="52.5" textAnchor="middle" fontSize="6.5" fill={S1} opacity={last ? 1 : 0.75} fontFamily="ui-sans-serif, system-ui, sans-serif">
              {step}
            </text>
            {index < shown.length - 1 ? <path d={`M${x + nodeW + 2} 50h${gap - 4}m-2.5-2.5 2.5 2.5-2.5 2.5`} stroke={S2} strokeWidth="0.9" /> : null}
          </g>
        );
      })}
      <path d={`M${start} 74h${total}`} stroke={S3} strokeWidth="0.8" strokeDasharray="2 3" />
    </g>
  );
}

function ArtMotif({ motif }: { motif: HomeArtMotif }) {
  switch (motif) {
    case "image":
      return (
        <g>
          <rect x="44" y="20" width="72" height="60" rx="6" stroke={S2} strokeWidth="1.2" />
          <rect x="52" y="14" width="72" height="60" rx="6" stroke={S3} strokeWidth="1" />
          <path d="M44 66 62 48l14 14 10-10 30 22" stroke={S1} strokeWidth="1.4" />
          <circle cx="98" cy="36" r="5" stroke={S1} strokeWidth="1.3" />
        </g>
      );
    case "edit":
      return (
        <g>
          <rect x="40" y="18" width="80" height="64" rx="6" stroke={S3} strokeWidth="1" strokeDasharray="3 3" />
          <path d="M58 64c10-18 24-26 44-22" stroke={S2} strokeWidth="1.2" strokeDasharray="2 3" />
          <path d="m96 30 12 12-30 30H66V60z" stroke={S1} strokeWidth="1.4" />
          <path d="m90 36 12 12" stroke={S1} strokeWidth="1.2" />
        </g>
      );
    case "video":
      return (
        <g>
          <rect x="30" y="26" width="100" height="48" rx="6" stroke={S2} strokeWidth="1.2" />
          {[40, 56, 72, 88, 104, 120].map((x) => (
            <rect key={x} x={x - 4} y="30" width="8" height="5" rx="1" stroke={S3} strokeWidth="0.8" />
          ))}
          {[40, 56, 72, 88, 104, 120].map((x) => (
            <rect key={`b${x}`} x={x - 4} y="65" width="8" height="5" rx="1" stroke={S3} strokeWidth="0.8" />
          ))}
          <path d="m74 42 16 8-16 8z" stroke={S1} strokeWidth="1.4" />
        </g>
      );
    case "3d":
      return (
        <g>
          <path d="M80 16 112 32v36L80 84 48 68V32z" stroke={S1} strokeWidth="1.4" />
          <path d="M48 32 80 48l32-16M80 48v36" stroke={S2} strokeWidth="1.1" />
          <path d="M64 24 96 40M96 24 64 40M64 76V40M96 76V40" stroke={S3} strokeWidth="0.8" strokeDasharray="2 3" />
          <ellipse cx="80" cy="88" rx="40" ry="5" stroke={S3} strokeWidth="0.8" />
        </g>
      );
    case "voice":
    case "music":
    case "sfx": {
      const count = motif === "sfx" ? 11 : 15;
      const width = motif === "music" ? 5 : 3;
      const gap = motif === "music" ? 8 : 7;
      const start = 80 - ((count - 1) * gap) / 2;
      return (
        <g>
          {BAR_HEIGHTS.slice(0, count).map((height, index) => {
            const h = motif === "sfx" ? (index === 5 ? 76 : Math.max(8, height * (index % 3 === 0 ? 0.3 : 0.55))) : height * 0.8;
            return (
              <rect
                key={index}
                x={start + index * gap - width / 2}
                y={50 - h / 2}
                width={width}
                height={h}
                rx={width / 2}
                fill={index % 4 === 1 ? S1 : S2}
                opacity={index % 4 === 1 ? 0.95 : 0.55}
              />
            );
          })}
          {motif === "music" ? <path d="M22 84h116" stroke={S3} strokeWidth="0.8" /> : null}
        </g>
      );
    }
    case "transcribe":
      return (
        <g>
          {[28, 40, 52, 64, 76].map((y, index) => (
            <path key={y} d={`M40 ${y}h${[70, 56, 80, 48, 64][index]}`} stroke={index === 2 ? S1 : S2} strokeWidth={index === 2 ? 1.6 : 1.1} opacity={index === 2 ? 1 : 0.6} />
          ))}
          <path d="M28 26v52" stroke={S3} strokeWidth="1" strokeDasharray="2 3" />
          <text x="24" y="54" textAnchor="end" fontSize="6" fill={S3} fontFamily="ui-monospace, monospace">0:12</text>
        </g>
      );
    case "dub":
      return (
        <g>
          <rect x="30" y="26" width="46" height="30" rx="8" stroke={S2} strokeWidth="1.2" />
          <path d="M40 56v10l10-10" stroke={S2} strokeWidth="1.2" />
          <text x="53" y="45" textAnchor="middle" fontSize="11" fill={S2} fontFamily="ui-sans-serif, system-ui">EN</text>
          <rect x="84" y="42" width="46" height="30" rx="8" stroke={S1} strokeWidth="1.4" />
          <path d="M120 72v10l-10-10" stroke={S1} strokeWidth="1.4" />
          <text x="107" y="61" textAnchor="middle" fontSize="11" fill={S1} fontFamily="ui-sans-serif, system-ui">ES</text>
        </g>
      );
    case "changer":
      return (
        <g>
          {BAR_HEIGHTS.slice(0, 7).map((height, index) => (
            <rect key={`a${index}`} x={30 + index * 6} y={50 - height * 0.3} width="2.5" height={height * 0.6} rx="1.2" fill={S2} opacity="0.55" />
          ))}
          <path d="M76 44h12l-4-4M88 56H76l4 4" stroke={S1} strokeWidth="1.3" />
          {BAR_HEIGHTS.slice(5, 12).map((height, index) => (
            <rect key={`b${index}`} x={96 + index * 6} y={50 - height * 0.32} width="2.5" height={height * 0.64} rx="1.2" fill={S1} opacity="0.9" />
          ))}
        </g>
      );
    case "canvas":
      return (
        <g>
          <rect x="22" y="22" width="36" height="26" rx="5" stroke={S1} strokeWidth="1.3" />
          <rect x="102" y="22" width="36" height="26" rx="5" stroke={S2} strokeWidth="1.1" />
          <rect x="62" y="58" width="36" height="26" rx="5" stroke={S2} strokeWidth="1.1" />
          <path d="M58 35h44M40 48c0 18 10 23 22 23M120 48c0 18-10 23-22 23" stroke={S3} strokeWidth="1" strokeDasharray="2 3" />
          <circle cx="58" cy="35" r="2" fill={S1} />
          <circle cx="102" cy="35" r="2" fill={S2} />
        </g>
      );
    case "agent":
      return (
        <g>
          <path d="M80 18l5 14 14 5-14 5-5 14-5-14-14-5 14-5z" stroke={S1} strokeWidth="1.4" />
          <path d="M40 72h28M40 80h18M96 64h26M96 72h18" stroke={S2} strokeWidth="1.1" />
          <path d="M80 60v10M70 76h20" stroke={S3} strokeWidth="1" strokeDasharray="2 3" />
          <path d="M116 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" stroke={S2} strokeWidth="1" />
        </g>
      );
    case "marketing":
      return (
        <g>
          <rect x="30" y="24" width="30" height="40" rx="4" stroke={S2} strokeWidth="1.1" />
          <rect x="66" y="18" width="30" height="52" rx="4" stroke={S1} strokeWidth="1.4" />
          <rect x="102" y="28" width="30" height="30" rx="4" stroke={S2} strokeWidth="1.1" />
          <path d="M30 78h102" stroke={S3} strokeWidth="0.8" />
          <path d="M72 58h18M72 63h12" stroke={S2} strokeWidth="1" />
        </g>
      );
    case "influencer":
      return (
        <g>
          <circle cx="80" cy="40" r="14" stroke={S1} strokeWidth="1.4" />
          <path d="M56 82a24 24 0 0 1 48 0" stroke={S1} strokeWidth="1.4" />
          <circle cx="44" cy="46" r="9" stroke={S3} strokeWidth="1" />
          <circle cx="116" cy="46" r="9" stroke={S3} strokeWidth="1" />
          <path d="M112 20l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" stroke={S2} strokeWidth="1" />
        </g>
      );
    case "cinema":
      return (
        <g>
          <rect x="26" y="30" width="108" height="46" rx="4" stroke={S2} strokeWidth="1.2" />
          <path d="M26 22h108l-6 8H32z" stroke={S1} strokeWidth="1.3" />
          <path d="M44 22l-6 8M64 22l-6 8M84 22l-6 8M104 22l-6 8M124 22l-6 8" stroke={S1} strokeWidth="1" />
          <path d="M26 64h108" stroke={S3} strokeWidth="0.8" strokeDasharray="2 3" />
        </g>
      );
    case "template":
      return (
        <g>
          <rect x="34" y="18" width="92" height="22" rx="4" stroke={S1} strokeWidth="1.3" />
          <rect x="34" y="46" width="44" height="36" rx="4" stroke={S2} strokeWidth="1.1" />
          <rect x="84" y="46" width="42" height="36" rx="4" stroke={S2} strokeWidth="1.1" strokeDasharray="3 3" />
          <path d="M42 29h40" stroke={S2} strokeWidth="1" />
        </g>
      );
  }
}

/* ── App / template identity ─────────────────────────────────────────────── */

export const APP_MOTIF: Readonly<Record<string, HomeArtMotif>> = {
  "create-image": "image",
  "text-to-video": "video",
  "image-to-video": "video",
  "marketing-studio": "marketing",
  "ai-influencer": "influencer",
  "cinema-studio": "cinema",
};

/** The production chain each app and template runs, drawn on its card. */
export const APP_STEPS: Readonly<Record<string, readonly string[]>> = {
  "create-image": ["Prompt", "Model", "Image"],
  "text-to-video": ["Prompt", "Shot", "Video"],
  "image-to-video": ["Still", "Motion", "Video"],
  "marketing-studio": ["Brief", "Variants", "Review"],
  "ai-influencer": ["Character", "Scenes", "Posts"],
  "cinema-studio": ["Scene", "Shots", "Takes"],
  "product-shot": ["Product", "Direction", "Render"],
  "scene-board": ["Shots", "Takes", "Review"],
  "voice-draft": ["Script", "Voice", "Audio"],
  "campaign-starter": ["Brief", "Drafts", "Review"],
};

export const TEMPLATE_MOTIF: Readonly<Record<string, HomeArtMotif>> = {
  "product-shot": "image",
  "scene-board": "cinema",
  "voice-draft": "voice",
  "campaign-starter": "marketing",
};

/* ── Tool tile (bento) ──────────────────────────────────────────────────── */

export interface HomeToolTile {
  id: string;
  title: string;
  purpose: string;
  href: string;
  motif: HomeArtMotif;
  icon: string;
  /** Registry status for tools that are not fully runnable yet. */
  status?: string | null;
}

export function HomeToolCard({ tool, compact = false }: { tool: HomeToolTile; compact?: boolean }) {
  return (
    <Link
      href={tool.href}
      className={`group flex h-full min-h-[44px] flex-col overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[background-color,border-color] duration-150 hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] ${focus}`}
    >
      <HomeArt motif={tool.motif} className={`${compact ? "aspect-[5/2]" : "aspect-[2/1]"} transition-[filter] duration-150 group-hover:brightness-125`} />
      <span className="flex items-start gap-2.5 px-3 pb-3 pt-2.5 sm:px-3.5 sm:pb-3.5 sm:pt-3">
        <span aria-hidden="true" className="mt-px hidden h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] sm:flex bg-[var(--bg-elevated)] text-[var(--text-primary)] group-hover:bg-[var(--studio-bg-selected)]">
          <StudioNavIcon name={tool.icon} size={14} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium text-[var(--text-primary)]">{tool.title}</span>
            {tool.status ? (
              <span className="shrink-0 rounded-[5px] bg-[var(--bg-inset)] px-1.5 py-px text-[10px] font-medium text-[var(--text-secondary)]">{tool.status}</span>
            ) : null}
          </span>
          <span className="mt-0.5 hidden sm:block">
            <span className="line-clamp-2 text-[12px] leading-[1.45] text-[var(--text-tertiary)]">{tool.purpose}</span>
          </span>
        </span>
      </span>
    </Link>
  );
}

/* ── App / template card ────────────────────────────────────────────────── */

export function HomeFeatureCard({
  title,
  description,
  href,
  motif,
  steps,
  tags,
}: {
  title: string;
  description: string;
  href: string;
  motif: HomeArtMotif;
  steps?: readonly string[];
  tags: readonly string[];
}) {
  return (
    <Link
      href={href}
      className={`group flex h-full min-h-[44px] flex-col overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[background-color,border-color] duration-150 hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] ${focus}`}
    >
      <HomeArt motif={motif} steps={steps} className="aspect-[2/1] transition-[filter] duration-150 group-hover:brightness-125" />
      <span className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <span className="text-[13.5px] font-medium text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 line-clamp-2 text-[12px] leading-[1.45] text-[var(--text-tertiary)]">{description}</span>
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

/* ── Model card ─────────────────────────────────────────────────────────── */

/** Primary modality of a model family from its canonical tasks. */
export function familyMotif(tasks: readonly string[]): HomeArtMotif {
  const has = (prefix: string) => tasks.some((task) => task.startsWith(prefix));
  if (has("video.")) return "video";
  if (has("mesh.")) return "3d";
  if (has("image.edit") && !has("image.generate")) return "edit";
  if (has("image.")) return "image";
  if (has("music.")) return "music";
  if (has("speech.transcribe")) return "transcribe";
  if (has("speech.")) return "voice";
  if (has("audio.")) return "sfx";
  return "template";
}

const MOTIF_LABEL: Partial<Record<HomeArtMotif, string>> = {
  image: "Image",
  edit: "Edit",
  video: "Video",
  "3d": "3D",
  music: "Music",
  voice: "Voice",
  transcribe: "Speech",
  sfx: "Audio",
};

export function HomeModelCard({
  label,
  provider,
  tasks,
  endpointCount,
  executableCount,
  action,
}: {
  label: string;
  provider: string;
  tasks: readonly string[];
  endpointCount: number;
  executableCount: number;
  action: React.ReactNode;
}) {
  const motif = familyMotif(tasks);
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="relative">
        <HomeArt motif={motif} className="aspect-[2/1]" />
        {MOTIF_LABEL[motif] ? (
          <span className="absolute left-2.5 top-2.5 rounded-[6px] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--text-secondary)]">
            {MOTIF_LABEL[motif]}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <p className="truncate text-[13.5px] font-medium text-[var(--text-primary)]">{label}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-[var(--text-tertiary)]">{provider}</p>
        <p className="mt-2 text-[11.5px] text-[var(--text-secondary)]">
          {endpointCount} endpoints · {executableCount} ready to run
        </p>
        <div className="mt-auto pt-3">{action}</div>
      </div>
    </div>
  );
}
