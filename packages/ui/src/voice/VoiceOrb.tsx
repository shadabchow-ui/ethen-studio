"use client";

/**
 * components/voice/VoiceOrb.tsx
 * Shared VoiceOrb primitive — extracted from LabVoiceSystemSection.
 *
 * States: idle | connecting | listening | speaking | muted
 * Variants: default | blue | violet | emerald
 *
 * The System Lab imports this component instead of maintaining a duplicate.
 * No microphone access, recording, or real voice runtime.
 */

import { cn } from "../lib/utils";
import type { VoiceOrbState, VoiceOrbVariant } from "@ethen/contracts/voice/types";

export type { VoiceOrbState, VoiceOrbVariant };

const VARIANT: Record<VoiceOrbVariant, { fg: string; ring: string; fill: string }> = {
  default: {
    fg: "var(--text-primary)",
    ring: "var(--bg-elevated)",
    fill: "var(--bg-elevated)",
  },
  blue: {
    fg: "var(--text-primary)",
    ring: "var(--bg-elevated)",
    fill: "var(--bg-elevated)",
  },
  violet: {
    fg: "var(--text-primary)",
    ring: "var(--bg-elevated)",
    fill: "var(--bg-elevated)",
  },
  emerald: {
    fg: "var(--text-primary)",
    ring: "var(--bg-elevated)",
    fill: "var(--bg-elevated)",
  },
};

interface VoiceOrbProps {
  state: VoiceOrbState;
  variant?: VoiceOrbVariant;
  className?: string;
}

export function VoiceOrb({ state, variant = "default", className }: VoiceOrbProps) {
  const c = VARIANT[variant];
  const isMuted = state === "muted";
  const isConnecting = state === "connecting";
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";

  return (
    <div
      className={cn("relative flex items-center justify-center rounded-full", className)}
      role="img"
      aria-label={`Voice ${state}`}
    >
      {/* Ping ring — listening & speaking */}
      {(isListening || isSpeaking) && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-[0.18] motion-reduce:hidden"
          style={{ backgroundColor: c.fg }}
        />
      )}

      {/* Orb background */}
      <div
        className={cn("absolute inset-0 rounded-full", isMuted && "opacity-30")}
        style={{ background: c.fill, border: `1.5px solid ${c.ring}` }}
      />

      {/* Connecting spinner arc */}
      {isConnecting && (
        <div
          className="absolute inset-[3px] animate-spin rounded-full motion-reduce:hidden"
          style={{
            border: "2px solid transparent",
            borderTopColor: c.fg,
            animationDuration: "1.4s",
          }}
        />
      )}

      {/* Inner core dot */}
      <div
        className={cn("relative rounded-full transition-opacity", isMuted && "opacity-30")}
        style={{
          width: "40%",
          height: "40%",
          backgroundColor: c.fg,
          opacity: isMuted ? 0.3 : isSpeaking ? 0.9 : isListening ? 0.82 : 0.6,
        }}
      />

      {/* Mute slash icon */}
      {isMuted && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={c.fg}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-[36%] w-[36%]"
            aria-hidden
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
      )}
    </div>
  );
}
