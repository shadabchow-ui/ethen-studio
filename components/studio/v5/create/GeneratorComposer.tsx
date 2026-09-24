/**
 * STUDIO_M3A — the one generator composer.
 *
 * Every generator frame (create image/video/music/sfx, audio
 * voice/transcribe/dub/changer) renders this component, driven by a
 * composer-registry entry: one shell, one settings button, one primary
 * action, and registry-declared estimate/error placement. Frames keep
 * their own input state, submission journeys, and frame-specific
 * controls; the composer owns structure, labels, and validation titles.
 *
 * `children` is the legacy mode used only by the AudioComposer adapter:
 * pre-assembled row content with the historical audio spacing.
 */

"use client";

import * as React from "react";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { ComposerInputCopy, ComposerToolEntry } from "./composer-registry";

const SUBMIT_CLASS = `inline-flex min-h-[44px] items-center rounded-[9px] bg-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--accent-fg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 pointer-fine:min-h-[32px] ${STUDIO_FOCUS_RING_CLASS}`;

/** Create lane keeps its arrow affordance, gap, and hover treatment. */
const SUBMIT_ARROW_CLASS = "gap-1.5 transition-opacity hover:opacity-90";

const LOCKED_ACTION_CLASS =
  "ml-auto inline-flex min-h-[44px] cursor-not-allowed items-center rounded-[9px] bg-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--accent-fg)] opacity-50 pointer-fine:min-h-[32px]";

export interface GeneratorSubmitModel {
  label: string;
  /** Audio lane names the missing input; the create lane sets no tooltip. */
  title?: string;
  disabled: boolean;
  onSubmit: () => void;
  /** Create lane: the arrow affordance on the primary action. */
  arrow?: boolean;
}

export function GeneratorSettingsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] pointer-fine:min-h-[32px] ${STUDIO_FOCUS_RING_CLASS}`}
    >
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
      Settings
    </button>
  );
}

export function GeneratorSubmitButton({ model, actionLabel }: { model: GeneratorSubmitModel; actionLabel: string }) {
  return (
    <button
      type="button"
      onClick={model.onSubmit}
      disabled={model.disabled}
      aria-label={actionLabel}
      {...(model.title ? { title: model.title } : {})}
      className={`${SUBMIT_CLASS} ${model.arrow ? SUBMIT_ARROW_CLASS : ""}`}
    >
      {model.label}
      {model.arrow ? (
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      ) : null}
    </button>
  );
}

export function GeneratorComposer({
  entry = null,
  label,
  locked = false,
  openSettings = null,
  input,
  controls = null,
  trailing = null,
  lockedMeta = null,
  estimate = null,
  submit = null,
  error = null,
  children = null,
}: {
  /** Registry entry driving labels and placement; legacy mode ignores it. */
  entry?: ComposerToolEntry | null;
  /** Section label; each frame keeps its historical label. */
  label: string;
  locked?: boolean;
  openSettings?: (() => void) | null;
  /** Primary input, built by the registry field builders. */
  input?: React.ReactNode;
  /** Frame-specific row controls (references, quality, model chip). */
  controls?: React.ReactNode;
  /** Trailing row node inside the action group (the create lane's Settings). */
  trailing?: React.ReactNode;
  /** Locked row meta before the pill (the create lane's model summary). */
  lockedMeta?: React.ReactNode;
  /** Estimate bar; placement comes from the registry entry. */
  estimate?: React.ReactNode;
  /** Structured submit model; absent only in legacy children mode. */
  submit?: GeneratorSubmitModel | null;
  error?: React.ReactNode;
  /** Legacy mode: pre-assembled row content (AudioComposer adapter). */
  children?: React.ReactNode;
}) {
  const inRow = (entry?.estimatePlacement ?? "row") === "row";
  const structured = submit !== null || (locked && entry !== null);
  const rowGap = structured ? "gap-2" : "gap-2.5";
  if (locked) {
    return (
      <section
        aria-label={label}
        data-testid="create-action-region"
        className="w-full max-w-[760px] rounded-[18px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 pb-[11px] pt-3.5 opacity-80 shadow-[0_20px_60px_rgb(0_0_0/0.55)]"
      >
        {input ? <div className="px-1.5 pb-3.5 pt-0.5">{input}</div> : null}
        <div className={`flex flex-wrap items-center ${rowGap}`}>
          {entry ? (
            <>
              {lockedMeta}
              <span className={LOCKED_ACTION_CLASS}>{entry.actionLabel}</span>
            </>
          ) : (
            <>
              {openSettings ? <GeneratorSettingsButton onOpen={openSettings} /> : null}
              {children}
            </>
          )}
        </div>
      </section>
    );
  }
  // Row placement: the estimate is the composer's footer line under the controls.
  const rowEstimate =
    estimate && inRow ? <div data-testid="create-composer-footer" className="w-full px-1.5 pt-1">{estimate}</div> : null;
  const rowError = error && inRow ? <div className="w-full">{error}</div> : null;
  const belowEstimate = estimate && !inRow ? <div data-testid="create-composer-footer" className="mt-2 px-1.5">{estimate}</div> : null;
  const belowError = error && !inRow ? <div className="mt-3">{error}</div> : null;
  return (
    <section
      aria-label={label}
      data-testid="create-action-region"
      className="w-full max-w-[760px] rounded-[18px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 pb-[11px] pt-3.5 shadow-[0_20px_60px_rgb(0_0_0/0.55)]"
    >
      {input ? <div className="px-1.5 pb-3.5 pt-0.5">{input}</div> : null}
      <div className={`flex flex-wrap items-center ${rowGap}`}>
        {openSettings ? <GeneratorSettingsButton onOpen={openSettings} /> : null}
        {submit ? (
          <>
            {controls ? (
              <div data-testid="create-composer-tools" className="-m-0.5 flex min-w-0 flex-wrap items-center gap-2 p-0.5 max-md:basis-full max-md:flex-nowrap max-md:overflow-x-auto max-md:[scrollbar-width:none]">
                {controls}
              </div>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {trailing}
              <GeneratorSubmitButton model={submit} actionLabel={entry?.actionLabel ?? submit.label} />
            </div>
            {rowEstimate}
          </>
        ) : (
          children
        )}
        {submit ? rowError : null}
      </div>
      {submit ? belowEstimate : null}
      {submit ? belowError : null}
    </section>
  );
}

const FIELD_CLASS =
  "w-full bg-transparent text-[14px] leading-[1.5] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none disabled:cursor-not-allowed";

/**
 * Registry field builder: the composer's primary input for a tool
 * entry. Prompt/script variants render textareas, upload renders the
 * source asset id input. Frames keep ownership of value state.
 */
export function ComposerInputField({
  copy,
  variant,
  id,
  value,
  onChange,
  onKeyDown,
  disabled = false,
  textareaClassName = "",
  rows = null,
}: {
  copy: ComposerInputCopy;
  variant: ComposerToolEntry["inputVariant"];
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  disabled?: boolean;
  textareaClassName?: string;
  /** Locked previews keep their historical row count. */
  rows?: number | null;
}) {
  if (variant === "upload") {
    return (
      <input
        id={id}
        aria-label={copy.label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={disabled ? copy.lockedPlaceholder : copy.placeholder}
        disabled={disabled}
        className={FIELD_CLASS}
      />
    );
  }
  return (
    <textarea
      id={id}
      aria-label={copy.label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      placeholder={disabled ? copy.lockedPlaceholder : copy.placeholder}
      rows={rows ?? copy.rows}
      disabled={disabled}
      className={`${FIELD_CLASS} ${textareaClassName}`}
    />
  );
}
