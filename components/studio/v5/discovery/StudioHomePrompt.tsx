"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ComposerInputField } from "../create/GeneratorComposer";
import { composerToolFor } from "../create/composer-registry";
import { getAudioTool } from "../create/audio/audio-tool-bindings";
import { getCreateTool } from "../create/tool-definitions";
import { StudioNavIcon } from "../shell/studio-nav-icons";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";

/**
 * M6A home prompt — surfaces every tool that accepts text input (the six
 * prompt tools plus voice-as-script). Upload-first tools (transcribe, dub,
 * changer) stay one click below in the tool grid: routing them with a text
 * prompt would silently drop the text. Generate routes to the chosen tool
 * with the prompt carried in `?prompt=` state.
 */
const PROMPT_TOOL_IDS = ["image", "edit", "video", "voice", "music", "sfx", "3d"] as const;

export type HomePromptToolId = (typeof PROMPT_TOOL_IDS)[number];

/** Final polish — the medium switch: short labels and the sidebar glyphs. */
const TOOL_CHIPS: Readonly<Record<HomePromptToolId, { label: string; icon: string }>> = {
  image: { label: "Image", icon: "image" },
  video: { label: "Video", icon: "video" },
  edit: { label: "Edit", icon: "edit" },
  "3d": { label: "3D", icon: "cube" },
  voice: { label: "Voice", icon: "voice" },
  music: { label: "Music", icon: "music" },
  sfx: { label: "Sound FX", icon: "sfx" },
};

const CHIP_ORDER: readonly HomePromptToolId[] = ["image", "video", "edit", "3d", "voice", "music", "sfx"];

export function isHomePromptToolId(value: string): value is HomePromptToolId {
  return (PROMPT_TOOL_IDS as readonly string[]).includes(value);
}

function toolTitle(id: HomePromptToolId): string {
  return getCreateTool(id)?.title ?? getAudioTool(id)?.title ?? id;
}

function toolRoute(id: HomePromptToolId): string {
  return getCreateTool(id)?.route ?? `/studio/create/${id}`;
}

export function homePromptHref(toolId: HomePromptToolId, projectId: string | null, prompt: string): string {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  const trimmed = prompt.trim();
  if (trimmed) params.set("prompt", trimmed);
  const query = params.toString();
  return query ? `${toolRoute(toolId)}?${query}` : toolRoute(toolId);
}

export const HOME_PROMPT_INPUT_ID = "studio-home-prompt";

/**
 * Final polish — the hero. Prompt-first creation on the left (medium
 * switch, composer, Generate), the curated media collage on the right from
 * lg; below lg the collage follows the composer. `children` renders under
 * the composer (the inspiration chips).
 */
export function StudioHomePrompt({
  projectId,
  toolId,
  prompt,
  onToolChange,
  onPromptChange,
  media,
  children,
}: {
  projectId: string | null;
  toolId: HomePromptToolId;
  prompt: string;
  onToolChange: (toolId: HomePromptToolId) => void;
  onPromptChange: (prompt: string) => void;
  media?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const entry = composerToolFor(toolId);
  const submit = React.useCallback(() => {
    router.push(homePromptHref(toolId, projectId, prompt));
  }, [router, toolId, projectId, prompt]);
  return (
    <section aria-label="Create something new" className="relative overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:radial-gradient(80%_110%_at_0%_0%,color-mix(in_srgb,var(--text-primary)_5.5%,transparent),transparent_60%)]" />
      <div className={`relative grid gap-6 p-4 sm:p-6 lg:gap-8 lg:p-8 ${media ? "xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : ""}`}>
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Ethen Studio</p>
          <h2 className="mt-2 text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--text-primary)] sm:text-[32px]">What will you create?</h2>
          <p className="mt-2 max-w-[52ch] text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">
            Pick a medium and describe the result. Generate opens that tool with your words already in the composer.
          </p>

          <div className="mt-5 overflow-hidden rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-inset)] shadow-[0_18px_48px_color-mix(in_srgb,var(--studio-primary-fg)_40%,transparent)] transition-colors duration-150 focus-within:border-[var(--border-strong)]">
            <div
              role="group"
              aria-label="Tool"
              className="flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)] p-1.5 [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [&::-webkit-scrollbar]:hidden"
            >
              {CHIP_ORDER.map((id) => {
                const selected = id === toolId;
                const chip = TOOL_CHIPS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    title={toolTitle(id)}
                    onClick={() => onToolChange(id)}
                    className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] transition-colors duration-150 pointer-fine:min-h-[34px] ${
                      selected
                        ? "bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-default)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                    } ${STUDIO_FOCUS_RING_CLASS}`}
                  >
                    <StudioNavIcon name={chip.icon} size={14} />
                    {chip.label}
                  </button>
                );
              })}
            </div>
            <div className="px-4 pb-2 pt-3">
              {entry ? (
                <ComposerInputField
                  copy={entry.input}
                  variant={entry.inputVariant}
                  id={HOME_PROMPT_INPUT_ID}
                  value={prompt}
                  onChange={onPromptChange}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
                  }}
                  textareaClassName="resize-none"
                  rows={3}
                />
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 px-3 pb-3 pl-4">
              <p className="min-w-0 truncate text-[11.5px] text-[var(--text-tertiary)]">
                Opens <span className="text-[var(--text-secondary)]">{toolTitle(toolId)}</span>
                <span className="hidden sm:inline"> · ⌘/Ctrl + Enter</span>
              </p>
              <button
                type="button"
                onClick={submit}
                className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--accent)] px-5 text-[13.5px] font-semibold text-[var(--accent-fg)] transition-opacity duration-150 hover:opacity-90 active:opacity-80 pointer-fine:min-h-[38px] ${STUDIO_FOCUS_RING_CLASS}`}
              >
                Generate
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
          {children}
        </div>
        {media ? <div className="min-w-0 xl:self-center">{media}</div> : null}
      </div>
    </section>
  );
}
