"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

// ── Voice states — idle / listening / speaking / connecting / muted ──────
export type V2VoiceState = "idle" | "listening" | "speaking" | "connecting" | "muted";

export interface V2VoiceButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  state?: V2VoiceState;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const sizeMap: Record<NonNullable<V2VoiceButtonProps["size"]>, string> = {
  sm: styles.voiceSm,
  md: styles.voiceMd,
  lg: styles.voiceLg,
};

/**
 * Production V2 VoiceButton.
 * Geometry: 32 / 40 / 48 (small/medium/large) — matches locked control scale.
 * Radius: 999 (pill via border-radius: 50%). No decorative gradients/glow.
 * Focus-visible uses semantic --v2-focus. Composer voice control reuses size sm.
 */
export function V2VoiceButton({
  state = "idle",
  size = "md",
  label,
  className,
  disabled,
  ...props
}: V2VoiceButtonProps) {
  const aria = label ?? `Voice ${state}`;
  return (
    <button
      type="button"
      aria-label={aria}
      aria-pressed={state === "listening" || state === "speaking" ? true : undefined}
      data-state={state}
      disabled={disabled}
      className={cn(styles.voiceButton, sizeMap[size], styles[`voice_${state}` as never], className)}
      {...props}
    >
      <span className={styles.voiceIcon} aria-hidden>
        {/* Mic glyph — 16px, stroke 1.5, no fill */}
        <svg viewBox="0 0 16 16" fill="none" className={styles.voiceSvg}>
          {state === "muted" ? (
            <>
              <rect x="6" y="2.5" width="4" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.35" />
              <path d="M4.2 7.8 A4.2 4.2 0 0 0 11.8 7.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M8 11.2 V13.2 M5.5 13.2 H10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="2.2" y1="2.2" x2="13.8" y2="13.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
            </>
          ) : (
            <>
              <rect x="6" y="2.5" width="4" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.35" />
              <path d="M4.2 7.8 A4.2 4.2 0 0 0 11.8 7.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M8 11.2 V13.2 M5.5 13.2 H10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              {state === "connecting" ? <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.45" /> : null}
            </>
          )}
        </svg>
      </span>
      {state === "connecting" ? <span className={styles.voiceSpinner} aria-hidden /> : null}
      {state === "listening" || state === "speaking" ? <span className={styles.voicePulse} aria-hidden /> : null}
    </button>
  );
}

// ── Transcript preview — row + mono provenance ─────────────────────────
export function V2VoiceTranscript({
  text,
  interim,
  speaker = "You",
  time,
  className,
}: {
  text: string;
  interim?: string;
  speaker?: string;
  time?: string;
  className?: string;
}) {
  return (
    <div className={cn(styles.voiceTranscript, className)} role="log" aria-live="polite" aria-label="Voice transcript">
      <div className={styles.voiceTranscriptHead}>
        <span className={styles.voiceTranscriptSpeaker}>{speaker}</span>
        {time ? <time className={styles.voiceTranscriptTime}>{time}</time> : null}
      </div>
      <p className={styles.voiceTranscriptText}>
        {text}
        {interim ? <span className={styles.voiceTranscriptInterim}> {interim}</span> : null}
      </p>
    </div>
  );
}

// ── Call controls — row of 32px icon controls (mute/end/speaker) ─────
export function V2VoiceCallControls({
  state = "speaking",
  onMute,
  onEnd,
  onSpeaker,
  muted = false,
  className,
}: {
  state?: V2VoiceState;
  onMute?: () => void;
  onEnd?: () => void;
  onSpeaker?: () => void;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(styles.voiceCallControls, className)} role="group" aria-label="Call controls">
      <button type="button" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} onClick={onMute} className={cn(styles.voiceCallButton, muted && styles.voiceCallButtonActive)}>
        <span aria-hidden>{muted ? "⦸" : "◯"}</span>
        <span className={styles.voiceCallLabel}>{muted ? "Unmute" : "Mute"}</span>
      </button>
      <button type="button" aria-label="End call" onClick={onEnd} className={cn(styles.voiceCallButton, styles.voiceCallButtonDanger)}>
        <span aria-hidden>✕</span>
        <span className={styles.voiceCallLabel}>End</span>
      </button>
      <button type="button" aria-label="Speaker" onClick={onSpeaker} className={styles.voiceCallButton}>
        <span aria-hidden>◐</span>
        <span className={styles.voiceCallLabel}>Speaker</span>
      </button>
      <span className={cn(styles.voiceStateBadge, styles[`voiceState_${state}` as never])} aria-label={`Call ${state}`}>{state}</span>
    </div>
  );
}

// ── Compact Composer voice control — 32px icon, same api as Composer ─
export function V2ComposerVoiceControlCompact({
  state = "idle",
  onClick,
  className,
}: {
  state?: V2VoiceState;
  onClick?: () => void;
  className?: string;
}) {
  return <V2VoiceButton size="sm" state={state} label="Voice input" onClick={onClick} className={cn(styles.voiceComposerControl, className)} />;
}

// ── Mobile voice sheet — bottom sheet variant for voice capture ────────
export function V2VoiceSheet({
  open,
  onOpenChange,
  state = "listening",
  transcript,
  interim,
  onClose,
  className,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  state?: V2VoiceState;
  transcript?: string;
  interim?: string;
  onClose?: () => void;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className={cn(styles.voiceSheetScrim, className)} role="dialog" aria-modal="true" aria-label="Voice input">
      <div className={styles.voiceSheet} data-state={state}>
        <div className={styles.voiceSheetHandle} aria-hidden />
        <div className={styles.voiceSheetHead}>
          <span className={styles.voiceSheetTitle}>Voice</span>
          <span className={cn(styles.voiceStateBadge, styles[`voiceState_${state}` as never])}>{state}</span>
          <button type="button" aria-label="Close voice sheet" onClick={() => { onClose?.(); onOpenChange?.(false); }} className={styles.voiceSheetClose}>✕</button>
        </div>
        <div className={styles.voiceSheetBody}>
          <div className={styles.voiceSheetOrbWrap}>
            <V2VoiceButton state={state} size="lg" aria-hidden tabIndex={-1} />
          </div>
          <V2VoiceTranscript text={transcript ?? "Listening… say “draft a workflow for..” "} interim={interim} />
          <V2VoiceCallControls state={state} onEnd={() => { onClose?.(); onOpenChange?.(false); }} />
        </div>
      </div>
    </div>
  );
}

// ── Inline state matrix helper for lab specimens ────────────────────────
export function V2VoiceStateMatrix({ className }: { className?: string }) {
  const states: V2VoiceState[] = ["idle", "listening", "speaking", "connecting", "muted"];
  return (
    <div className={cn(styles.voiceMatrix, className)} role="group" aria-label="Voice states">
      {states.map((s) => (
        <div key={s} className={styles.voiceMatrixItem}>
          <V2VoiceButton state={s} size="md" label={`Voice ${s}`} />
          <span className={styles.voiceMatrixLabel}>{s}</span>
        </div>
      ))}
    </div>
  );
}
