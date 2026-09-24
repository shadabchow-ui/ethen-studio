"use client";

/**
 * D15-J03 — shared flagship composer surface.
 *
 * One implementation consumed by F-01, F-02 and F-03. Composes the EDS
 * conversation frame with either a caller-owned wired composer (slot mode —
 * F-01's Cortex composer keeps its models/voice/projects/launch wiring
 * untouched) or the EDS composer directly (direct mode — F-02's objective
 * input, F-03's empty state). Draft, message list and scroll state stay
 * caller-owned so switching never remounts the tree.
 *
 * Inherits the containing EDS surface scope (theme + density). Do not add
 * data-eds here: a bare scope re-declares Dark values and traps the theme.
 */
import * as React from "react";
import {
  ConversationFrame,
  type ConversationVariant,
} from "../conversation/ConversationFrame";
import {
  Composer,
  type ComposerStatus,
} from "../composer/Composer";

export interface FlagshipComposerSurfaceProps {
  variant?: ConversationVariant;
  label?: string;
  /** Conversation content above the composer. Empty renders the new-task surface. */
  messages?: React.ReactNode;
  statusRegion?: React.ReactNode;
  /**
   * Slot mode: a fully wired product composer (F-01). Takes precedence over
   * every direct-mode prop when provided.
   */
  composer?: React.ReactNode;
  /** Direct mode: EDS composer value. Required when `composer` is absent. */
  composerValue?: string;
  onComposerChange?: (value: string) => void;
  onComposerSubmit?: (value: string) => void;
  composerStatus?: ComposerStatus;
  composerPlaceholder?: string;
  composerLabel?: string;
  composerError?: string;
  onComposerRetry?: () => void;
  composerDisabled?: boolean;
  id?: string;
  className?: string;
}

export function FlagshipComposerSurface({
  variant = "work",
  label = "Task composer",
  messages,
  statusRegion,
  composer,
  composerValue = "",
  onComposerChange,
  onComposerSubmit,
  composerStatus = "idle",
  composerPlaceholder,
  composerLabel,
  composerError,
  onComposerRetry,
  composerDisabled = false,
  id,
  className,
}: FlagshipComposerSurfaceProps) {
  return (
    <ConversationFrame
      variant={variant}
      label={label}
      messages={messages ?? null}
      statusRegion={statusRegion}
      composer={
        composer ??
        (onComposerSubmit ? (
          <Composer
            variant={variant === "prose" ? "prose" : "work"}
            label={composerLabel}
            placeholder={composerPlaceholder}
            value={composerValue}
            onValueChange={onComposerChange ?? (() => {})}
            onSubmit={onComposerSubmit}
            status={composerStatus}
            disabled={composerDisabled}
            error={composerError}
            onRetry={onComposerRetry}
          />
        ) : null)
      }
      id={id}
      className={className}
    />
  );
}
