"use client";

/**
 * Workspace Composer Base — Shared Composer Primitive
 * ====================================================
 *
 * Conformance checklist for future workspaces:
 * - [ ] Uses WorkspaceComposerBase for text input + send/stop
 * - [ ] Passes isLoading for loading/stop state
 * - [ ] Passes disabled + disabledReason for setup-required / unavailable
 * - [ ] Slots actionMenu, voiceInput, modelControl instead of hardcoding inline buttons
 * - [ ] Renders at mobile-safe widths (max-w-[940px], px-4 on small screens)
 * - [ ] Sends trimmed value; does not send empty strings
 * - [ ] Supports Enter to submit, Shift+Enter for newline
 * - [ ] Uses SendStopButton for send/stop chrome (no custom inline buttons)
 * - [ ] Composer does not re-render the homepage head/subhead pattern (use EthenChatPanel for that)
 *
 * This is the single shared composer pattern. Do not inline send/stop
 * buttons or textarea logic in workspace components.
 */

import { useCallback, useRef, useState } from "react";
import { cn } from "./lib/utils";
import type { ComposerSendState } from "@ethen/contracts/workspaces/shell-contract";
import { SendStopButton } from "./send-stop-button";

// Inlined from the liquid-glass module to remove the dependency.
// CSS class defined in globals.css.
const COMPOSER_SMOKED_CLASS = "ethen-panel-smoked";

export interface WorkspaceComposerBaseProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
  textareaClassName?: string;
  shellClassName?: string;
  className?: string;
  surface?: "default" | "smoked";
  actionMenu?: React.ReactNode;
  voiceInput?: React.ReactNode;
  modelControl?: React.ReactNode;
  beforeInput?: React.ReactNode;
  afterInput?: React.ReactNode;
  /** Automatically focus the textarea on mount */
  autoFocus?: boolean;
}

export function deriveSendState(opts: {
  isLoading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  value: string;
}): ComposerSendState {
  if (opts.disabled) {
    return { type: "disabled", reason: opts.disabledReason ?? "Not available" };
  }
  if (opts.isLoading) {
    return { type: "stop" };
  }
  return { type: "send", canSend: opts.value.trim().length > 0 };
}

export function WorkspaceComposerBase({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading = false,
  disabled = false,
  disabledReason,
  placeholder = "Message Ethen...",
  textareaClassName,
  shellClassName,
  className,
  surface = "default",
  actionMenu,
  voiceInput,
  modelControl,
  beforeInput,
  afterInput,
  autoFocus,
}: WorkspaceComposerBaseProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);
  const trimmed = value.trim();

  const handleSubmit = useCallback(() => {
    if (!trimmed || isLoading || disabled) return;
    onSubmit(trimmed);
  }, [trimmed, isLoading, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, isComposing],
  );

  const sendState = deriveSendState({ isLoading, disabled, disabledReason, value });

  return (
    <div
      className={cn(
        "flex min-h-[56px] w-full items-center gap-2 rounded-[30px] pl-2 pr-[7px] transition-colors",
        surface === "smoked"
          ? cn(
              COMPOSER_SMOKED_CLASS,
              "focus-within:border-[rgba(255,255,255,0.135)]",
            )
          : "border border-[var(--border-default)] bg-[var(--bg-elevated)] focus-within:border-[var(--border-default)]",
        disabled && "opacity-60",
        shellClassName,
        className,
      )}
    >
      {actionMenu && <div className="shrink-0">{actionMenu}</div>}
      {beforeInput}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={1}
        autoFocus={autoFocus}
        disabled={disabled}
        className={cn(
          "min-h-[36px] flex-1 resize-none appearance-none border-0 bg-transparent py-3 text-[17px] leading-[1.5] tracking-[-0.015em] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] disabled:cursor-not-allowed",
          surface === "smoked" &&
            "text-[#ededed] placeholder:text-[#8a8a8a]",
          textareaClassName,
        )}
      />

      {afterInput}
      {modelControl && <div className="shrink-0">{modelControl}</div>}

      {onStop || !disabled ? (
        <SendStopButton
          state={sendState}
          onSend={handleSubmit}
          onStop={() => onStop?.()}
          variant="chat-panel"
        />
      ) : (
        voiceInput && <div className="shrink-0">{voiceInput}</div>
      )}
    </div>
  );
}
