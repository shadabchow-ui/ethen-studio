"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";
import { V2Composer, type V2ComposerProps } from "../Composer";
import { V2Badge } from "../Badge";
import { V2Button } from "../Button";
import { V2SegmentedControl } from "../SegmentedControl";

export type StudioVariant =
  | "image"
  | "video"
  | "audio"
  | "product-ad"
  | "image-to-video"
  | "character-motion"
  | "cinematic"
  | "marketing"
  | "game-asset";

export type StudioSettingGroup = {
  title: string;
  rows: Array<{ label: string; value: string; helper?: string }>;
};

export interface StudioWorkbenchProps {
  variant: StudioVariant;
  appTitle?: string;
  activeMode?: string;
  modes?: string[];
  status?: { label: string; tone?: "neutral" | "success" | "warning" | "info" | "danger" };
  inspector?: StudioSettingGroup[];
  inspectorSlot?: React.ReactNode;
  preview?: React.ReactNode;
  generationState?: "idle" | "queued" | "running" | "success" | "error";
  generationMeta?: string;
  history?: Array<{ title: string; meta: string; thumbLabel?: string }>;
  historySlot?: React.ReactNode;
  references?: React.ReactNode;
  resultActions?: React.ReactNode;
  composerProps?: Partial<V2ComposerProps>;
  className?: string;
  onModeChange?: (mode: string) => void;
  children?: React.ReactNode;
}

const VARIANT_TITLES: Record<StudioVariant, string> = {
  image: "Image Generator",
  video: "Video Generator",
  audio: "Audio Generator",
  "product-ad": "Product Ad Generator",
  "image-to-video": "Image to Video",
  "character-motion": "Character Motion",
  cinematic: "Cinematic Generator",
  marketing: "Marketing Asset Generator",
  "game-asset": "Game Asset Generator",
};

const VARIANT_MODES: Record<StudioVariant, string[]> = {
  image: ["Generate", "Edit", "Variants", "References"],
  video: ["Storyboard", "Scene", "Generate", "History"],
  audio: ["Generate", "Voice", "Transcript", "Mix"],
  "product-ad": ["Brief", "Concepts", "Variants", "Export"],
  "image-to-video": ["Source", "Motion", "Preview", "Export"],
  "character-motion": ["Character", "Motion", "Scene", "Render"],
  cinematic: ["Script", "Shots", "Generate", "Timeline"],
  marketing: ["Board", "Ad Sets", "Social", "Landing"],
  "game-asset": ["Prompt", "Variants", "Rig", "Export"],
};

function DefaultStage({ variant, state }: { variant: StudioVariant; state: StudioWorkbenchProps["generationState"] }) {
  const label = VARIANT_TITLES[variant];
  return (
    <div className={styles.studioStage}>
      <div className={styles.studioStagePreview} aria-label={`${label} preview stage`}>
        <p className={styles.studioStageEyebrow}>{label} · central stage</p>
        <div className={styles.studioStageCanvas}>
          <span className={styles.studioStageCanvasLabel}>Preview · 16:9 stage (V2 raised 12px only when floating)</span>
        </div>
        <div className={styles.studioStageBar}>
          <span className={cn(styles.studioStageState, state === "running" && styles.studioStageStateRunning, state === "success" && styles.studioStageStateSuccess, state === "error" && styles.studioStageStateError)}>
            <span className={styles.studioStageDot} aria-hidden />{state ?? "idle"}
          </span>
          <span className={styles.studioStageMeta}>No glow/haze — flat border + whitespace. 12px only for floating preview.</span>
        </div>
      </div>
    </div>
  );
}

/**
 * StudioWorkbench — generator workbench product shell.
 * Interior workbench (app nav + inspector + stage + composer + references/history + generation state).
 * Reused across image/video/audio/product-ad/image-to-video/character-motion/cinematic/marketing/game-asset via `variant` + slots.
 * Outer Console frame (256/56 sidebar, 56 topbar, 320/404 rail, 24 gutter) stays owned by ConsoleShell; this shell occupies the main workspace.
 * Uses shared V2 Composer, flat rows/dividers, 6px base radius, Geist.
 */
export function StudioShell(props: StudioWorkbenchProps) {
  return <StudioWorkbench {...props} />;
}

export function StudioWorkbench({
  variant,
  appTitle,
  activeMode,
  modes,
  status = { label: "Ready", tone: "success" },
  inspector,
  inspectorSlot,
  preview,
  generationState = "idle",
  generationMeta = "Queued · ~12s · 1024×1024",
  history,
  historySlot,
  references,
  resultActions,
  composerProps,
  className,
  onModeChange,
  children,
}: StudioWorkbenchProps & { children?: React.ReactNode }) {
  if (children) {
    return (
      <div className={cn(styles.studioWorkbench, className)} data-ethen-v2>
        <header data-v2-pattern="page-header" className="sr-only">{appTitle ?? "Studio"}</header>
        <nav data-v2-pattern="family-navigation" className="sr-only" aria-label="Studio">Studio</nav>
        <div data-v2-pattern="composer-surface" className="min-h-0 min-w-0 flex-1">{children}</div>
      </div>
    );
  }
  const title = appTitle ?? VARIANT_TITLES[variant];
  const modeOptions = modes ?? VARIANT_MODES[variant];
  const active = activeMode ?? modeOptions[0];
  const defaultInspector: StudioSettingGroup[] = inspector ?? [
    { title: "Output", rows: [{ label: "Aspect", value: "16:9" }, { label: "Resolution", value: "1024×1024" }, { label: "Quality", value: "High" }] },
    { title: "Generation", rows: [{ label: "Model", value: variant === "video" ? "Video core · scene route" : "Image core · quality route" }, { label: "Seed", value: "Random" }] },
  ];
  const defaultHistory = history ?? [
    { title: "Previous render — variant B", meta: "2 min ago · 1024×1024" },
    { title: "Reference pack — product front", meta: "18 min ago · 4 assets" },
    { title: "Draft — launch hero", meta: "1h ago · queued" },
  ];

  const segmented = modeOptions.map((m) => ({ id: m, label: m }));

  return (
    <div className={cn(styles.studioWorkbench, className)} data-variant={variant} data-ethen-v2>
      <div className={styles.studioWorkbenchTopbar}>
        <div className={styles.studioWorkbenchTitleRow}>
          <span className={styles.studioWorkbenchAppLabel}>Studio / {title}</span>
          <V2Badge tone={status.tone ?? "neutral"} size="sm">{status.label}</V2Badge>
        </div>
        <div className={styles.studioWorkbenchNav}>
          <V2SegmentedControl
            options={segmented}
            value={active}
            onValueChange={(v) => onModeChange?.(String(v))}
            aria-label="Generator navigation"
          />
        </div>
      </div>

      <div className={styles.studioWorkbenchBody}>
        <aside className={styles.studioWorkbenchHistory} aria-label="History and references">
          <div className={styles.studioPanelHead}>
            <h3 className={styles.studioPanelTitle}>History</h3>
            <span className={styles.studioPanelCount}>{defaultHistory.length}</span>
          </div>
          {historySlot ?? (
            <div className={styles.studioHistoryList} role="list">
              {defaultHistory.map((h) => (
                <div key={h.title} role="listitem" className={styles.studioHistoryRow}>
                  <div className={styles.studioHistoryThumb} aria-hidden>{h.thumbLabel ?? "▣"}</div>
                  <div className={styles.studioHistoryMain}>
                    <p className={styles.studioHistoryTitle}>{h.title}</p>
                    <p className={styles.studioHistoryMeta}>{h.meta}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className={styles.studioPanelDivider} />
          <div className={styles.studioPanelHead}>
            <h3 className={styles.studioPanelTitle}>References & assets</h3>
          </div>
          {references ?? (
            <div className={styles.studioReferenceList}>
              <div className={styles.studioReferenceRow}>Reference image · product-front.jpg <span className={styles.studioReferenceMeta}>— 2.1 MB</span></div>
              <div className={styles.studioReferenceRow}>Brand kit · typography rule <span className={styles.studioReferenceMeta}>— enforced</span></div>
              <button type="button" className={styles.studioReferenceAction}>Add asset</button>
            </div>
          )}
        </aside>

        <div className={styles.studioWorkbenchMain}>
          {preview ?? <DefaultStage variant={variant} state={generationState} />}

          <div className={styles.studioGenerationRow} data-state={generationState} role="status" aria-live="polite">
            <span className={styles.studioGenerationState}><span className={styles.studioGenerationDot} aria-hidden />{generationState}</span>
            <span className={styles.studioGenerationMeta}>{generationMeta}</span>
            <span className={styles.studioGenerationActions}>
              {resultActions ?? (
                <>
                  <V2Button size="sm" variant="secondary">Use as reference</V2Button>
                  <V2Button size="sm">Export</V2Button>
                </>
              )}
            </span>
          </div>

          <div className={styles.studioComposerDock}>
            <V2Composer placeholder={`Prompt ${title}… describe the shot, style, and constraints`} {...composerProps} />
            <p className={styles.studioComposerNote}>Shared V2 Composer · model/attach/voice/project/mode/send retain focus-visible — container does not glow on focus.</p>
          </div>
        </div>

        <aside className={styles.studioWorkbenchInspector} aria-label="Settings inspector" style={{ width: 320 } as React.CSSProperties}>
          {inspectorSlot ?? (
            <>
              {defaultInspector.map((group) => (
                <section key={group.title} className={styles.studioInspectorGroup}>
                  <h4 className={styles.studioInspectorTitle}>{group.title}</h4>
                  <div className={styles.studioInspectorList}>
                    {group.rows.map((row) => (
                      <div key={row.label} className={styles.studioInspectorRow}>
                        <span className={styles.studioInspectorLabel}>{row.label}</span>
                        <button type="button" className={styles.studioInspectorValue}>{row.value} <span aria-hidden>⌄</span></button>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
