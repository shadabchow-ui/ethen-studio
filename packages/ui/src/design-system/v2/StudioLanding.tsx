"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";
import { V2Button } from "./Button";
import { V2Composer } from "./Composer";
import { V2Badge } from "./Badge";

export type StudioLandingToolKind = "image" | "video" | "voice" | "design" | "marketing" | "workflow" | "model" | "local" | "brand";

export interface StudioLandingTool {
  label: string;
  title: string;
  description: string;
  cta: string;
  kind: StudioLandingToolKind;
  badge?: string;
}

export interface StudioLandingProps {
  title?: string;
  description?: string;
  tools?: StudioLandingTool[];
  recent?: Array<{ title: string; kind: StudioLandingToolKind; updated: string; status: string }>;
  gallery?: Array<{ title: string; eyebrow: string }>;
  className?: string;
  onToolOpen?: (tool: StudioLandingTool) => void;
}

const DEFAULT_TOOLS: StudioLandingTool[] = [
  { label: "Generate", title: "Image Studio", description: "Editorial visuals, product shots, references, and variants.", cta: "Open Image", kind: "image", badge: "Core" },
  { label: "Motion", title: "Video Studio", description: "Storyboard, scene, and prompt-to-video production blocks.", cta: "Create Video", kind: "video" },
  { label: "Speech", title: "Voice Studio", description: "Voice agents, transcripts, narration, and audio workbench.", cta: "Open Voice", kind: "voice" },
  { label: "Design", title: "Design Agent", description: "Generate interfaces, wireframes, decks, and design systems.", cta: "Open Design", kind: "design", badge: "Agent" },
  { label: "Launch", title: "Marketing Studio", description: "Campaign boards, ad variants, social assets, and landing sections.", cta: "Build Campaign", kind: "marketing" },
  { label: "Automate", title: "Workflow Agent", description: "Turn repeatable creative work into reviewable campaign pipelines.", cta: "Draft Flow", kind: "workflow" },
  { label: "Route", title: "Model Library", description: "Choose the right image, video, voice, design, or local model.", cta: "Compare Models", kind: "model" },
  { label: "Private", title: "Local / Private Models", description: "Route sensitive drafts to local models before publishing assets.", cta: "Route Private", kind: "local" },
];

const DEFAULT_RECENT = [
  { title: "Q4 campaign — product hero variants · 12 images", kind: "image" as const, updated: "Edited 2h ago", status: "Ready" },
  { title: "Storyboard — launch video scenes · 6 shots", kind: "video" as const, updated: "Edited 6h ago", status: "Draft" },
  { title: "Voice agent — onboarding transcript review", kind: "voice" as const, updated: "Edited yesterday", status: "Completed" },
  { title: "Design — pricing page layout · 3 variants", kind: "design" as const, updated: "Edited 2 days ago", status: "Review" },
];

const DEFAULT_GALLERY = [
  { title: "Product mockup", eyebrow: "Image Studio" },
  { title: "Ad creative", eyebrow: "Marketing Studio" },
  { title: "UI design", eyebrow: "Design Agent" },
  { title: "Transcript card", eyebrow: "Voice Studio" },
  { title: "Video storyboard", eyebrow: "Video Studio" },
  { title: "Voice waveform", eyebrow: "Audio Workbench" },
];

const KIND_GLYPH: Record<StudioLandingToolKind, string> = {
  image: "◧", video: "▣", voice: "◐", design: "▤", marketing: "⬔", workflow: "↯", model: "◆", local: "⬢", brand: "⬥",
};

/**
 * StudioLanding — product orientation + recent + generator entries + discovery.
 * Flat rows/dividers, 6px base radius, Geist, no decorative haze/glow or 22-30px cards.
 * Pilot frame compatible: 24px gutters, 24 gap, V2 tokens for Light/Dark.
 */
export function StudioLanding({
  title = "One studio for every model you create with.",
  description = "Generate images, video, voice, interfaces, and campaigns from a single Ethen workspace. Rows and dividers carry hierarchy — not giant marketing cards.",
  tools = DEFAULT_TOOLS,
  recent = DEFAULT_RECENT,
  gallery = DEFAULT_GALLERY,
  className,
  onToolOpen,
}: StudioLandingProps) {
  return (
    <div className={cn(styles.studioLanding, className)} data-ethen-v2>
      <header className={styles.studioLandingHeader}>
        <div className={styles.studioLandingTitles}>
          <p className={styles.studioKicker}>Ethen Studio · product orientation</p>
          <h2 className={styles.studioHeroTitle}>{title}</h2>
          <p className={styles.studioHeroDesc}>{description}</p>
          <div className={styles.studioHeaderActions}>
            <V2Button size="md">Open Studio</V2Button>
            <V2Button size="md" variant="secondary">Explore tools</V2Button>
            <span className={styles.studioHeaderMeta}>Dark + Light · rows not cards</span>
          </div>
        </div>
        <div className={styles.studioHeroComposer}>
          <V2Composer
            placeholder="Create a launch kit with product images, short video scenes, voiceover, social ads, and a landing page section…"
            attachments={[]}
            extension={
              <div className={styles.studioComposerModes} role="tablist" aria-label="Creative mode">
                {["Image", "Video", "Voice", "Design", "Campaign"].map((m, i) => (
                  <button key={m} type="button" role="tab" aria-selected={i === 0} className={cn(styles.studioModePill, i === 0 && styles.studioModePillActive)}>{m}</button>
                ))}
              </div>
            }
            onSend={() => {}}
          />
          <p className={styles.studioComposerMeta}>Shared V2 Composer · caret-only focus · no container focus ring</p>
        </div>
      </header>

      <section aria-label="Generator entry points">
        <div className={styles.studioSectionHead}>
          <h3 className={styles.studioSectionTitle}>Generator entry points</h3>
          <p className={styles.studioSectionDesc}>Eight production generators — same flat row/divider language, no 22–30px marketing radius.</p>
        </div>
        <div className={styles.studioToolGrid}>
          {tools.map((tool) => (
            <div key={tool.title} className={styles.studioToolRow}>
              <div className={styles.studioToolHead}>
                <span className={styles.studioToolKind} aria-hidden>{KIND_GLYPH[tool.kind]}</span>
                <span className={styles.studioToolLabel}>{tool.label}</span>
                {tool.badge ? <V2Badge size="sm" tone="neutral">{tool.badge}</V2Badge> : null}
              </div>
              <h4 className={styles.studioToolTitle}>{tool.title}</h4>
              <p className={styles.studioToolDesc}>{tool.description}</p>
              <button type="button" onClick={() => onToolOpen?.(tool)} className={styles.studioToolCta}>{tool.cta} →</button>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Recent projects and assets" className={styles.studioBand}>
        <div className={styles.studioSectionHead}>
          <h3 className={styles.studioSectionTitle}>Recent projects & assets</h3>
          <p className={styles.studioSectionDesc}>Row-and-divider hierarchy, not nested cards. Static preview.</p>
        </div>
        <div className={styles.studioRowList} role="list">
          {recent.map((r) => (
            <div key={r.title} role="listitem" className={styles.studioRecentRow}>
              <span className={styles.studioRecentKind} aria-hidden>{KIND_GLYPH[r.kind]}</span>
              <div className={styles.studioRecentMain}>
                <p className={styles.studioRecentTitle}>{r.title}</p>
                <p className={styles.studioRecentMeta}>{r.updated} · {r.kind}</p>
              </div>
              <V2Badge tone={r.status === "Ready" || r.status === "Completed" ? "success" : r.status === "Draft" ? "neutral" : "warning"} size="sm">{r.status}</V2Badge>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Creative discovery" className={styles.studioBand}>
        <div className={styles.studioSectionHead}>
          <h3 className={styles.studioSectionTitle}>Creative discovery</h3>
          <p className={styles.studioSectionDesc}>Gallery as flat row strip + capability index — no decorative haze.</p>
        </div>
        <div className={styles.studioGalleryRow} role="list">
          {gallery.map((g) => (
            <div key={g.title} role="listitem" className={styles.studioGalleryTile}>
              <p className={styles.studioGalleryEyebrow}>{g.eyebrow}</p>
              <p className={styles.studioGalleryTitle}>{g.title}</p>
            </div>
          ))}
        </div>
        <div className={styles.studioCapabilityGrid}>
          {[
            { title: "Create", items: ["Generate images", "Generate videos", "Generate voices", "Generate UI", "Generate campaigns"] },
            { title: "Edit", items: ["Replace background", "Create variants", "Rewrite copy", "Refine design", "Resize assets"] },
            { title: "Automate", items: ["Workflow agent", "Brand system reuse", "Approval packet", "Campaign pipeline"] },
            { title: "Analyze", items: ["Compare models", "Estimate cost", "Review assets", "Check brand fit", "Generate reports"] },
          ].map((group) => (
            <div key={group.title} className={styles.studioCapabilityGroup}>
              <h4 className={styles.studioCapabilityTitle}>{group.title}</h4>
              <ul className={styles.studioCapabilityList}>
                {group.items.map((it) => <li key={it} className={styles.studioCapabilityItem}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
