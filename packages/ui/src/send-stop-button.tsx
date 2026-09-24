"use client";

import { cn } from "./lib/utils";
import type { ComposerSendState } from "@ethen/contracts/workspaces/shell-contract";

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 11.5V2.5M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  );
}

interface SendStopButtonProps {
  state: ComposerSendState;
  onSend: () => void;
  onStop: () => void;
  className?: string;
  /** Visual variant. "composer" for bar-style, "compact" for minimal. */
  variant?: "composer" | "compact" | "chat-panel";
}

const buttonBase =
  "flex shrink-0 min-h-[44px] min-w-[44px] items-center justify-center rounded-full ethen-interactive ethen-pressable ethen-focus-ring outline-none";

const variants: Record<string, string> = {
  composer:
    "h-10 w-10",
  compact:
    "h-8 w-8",
  "chat-panel":
    "h-11 w-11",
};

export function SendStopButton({
  state,
  onSend,
  onStop,
  className,
  variant = "composer",
}: SendStopButtonProps) {
  if (state.type === "stop") {
    return (
      <button
        type="button"
        onClick={onStop}
        className={cn(
          buttonBase,
          variants[variant],
          "bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-90",
          className,
        )}
        aria-label="Stop generating"
        aria-busy="true"
      >
        <StopIcon />
      </button>
    );
  }

  if (state.type === "disabled") {
    return (
      <button
        type="button"
        disabled
        title={state.reason}
        className={cn(
          buttonBase,
          variants[variant],
          "cursor-not-allowed opacity-40",
          className,
        )}
        aria-label={state.reason}
      >
        <SendIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSend}
      disabled={!state.canSend}
      className={cn(
        buttonBase,
        variants[variant],
        "bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-90",
        !state.canSend && "cursor-not-allowed opacity-40",
        className,
      )}
      aria-label="Send message"
    >
      <SendIcon />
    </button>
  );
}
