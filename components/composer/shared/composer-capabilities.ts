"use client";

import type { ReactNode } from "react";

/**
 * FJ-09 — Shared composer capability contract.
 *
 * The Ethen composer surface is split into two layers:
 *
 *   1. A shared presentational input shell (`EthenComposerV3`) that implements
 *      these typed capabilities and nothing else. Orchestration (streaming,
 *      model-catalog fetch, launch POSTs, router handoffs) lives in product
 *      adapters that wrap the shell.
 *   2. Product adapters (`ConsoleComposer`, `CodeConsoleComposer`,
 *      `AgentPanelControlSurface`, `SystemLabHomeComposer`,
 *      `ModelDetailComposer`, `StudioAppPanelPage`, `DesignAgentLanding`,
 *      `MarketingComposerWithModels`, …) that supply orchestration through
 *      the shell's slots (model trigger/dropdown, add-menu items, pills,
 *      voice transcript, submit/stop).
 *
 * The legacy `EthenUniversalComposer` (marketplace/Fleet + dev labs) is an
 * intentional marketing/Fleet variant with its own Liquid Glass visual
 * contract; it is NOT merged into the shared shell (per FJ-09 constraint:
 * do not force visually similar but behaviorally distinct marketing and
 * product experiences into one runtime).
 *
 * These types are the parity checklist for the capability test
 * `tests/behavioral/fj09-composer-capability-parity.test.ts`.
 */

/** Capabilities the shared input shell must expose to every consumer. */
export const COMPOSER_CAPABILITIES = [
  "text-entry",
  "send-stop",
  "model-picker",
  "tool-menu",
  "attachments",
  "voice",
  "disabled-pending",
  "keyboard",
] as const;

export type ComposerCapabilityName = (typeof COMPOSER_CAPABILITIES)[number];

/** A menu item for the add/tool menu. */
export interface ComposerMenuItem {
  id: string;
  label: string;
  /** Hint text shown below the label (Block 302 grammar). */
  hint?: string;
  disabled?: boolean;
  onClick?: () => void;
}

/** A pill rendered below the composer surface (mode / access controls). */
export interface ComposerPill {
  id: string;
  label: string;
  onClick?: () => void;
  active?: boolean;
  emphasis?: boolean;
}

/** text-entry: controlled/uncontrolled value + placeholder + auto-grow. */
export interface ComposerTextEntryCapability {
  value?: string;
  onValueChange?: (v: string) => void;
  placeholder?: string;
}

/**
 * send-stop: submit contract plus the stop state.
 *
 * `isRunning` switches the primary action to a stop control calling
 * `onStop`; Enter still routes through `handleSubmit` so stop stays
 * reachable from the keyboard (parity with EthenUniversalComposer).
 */
export interface ComposerSendStopCapability {
  onSubmit?: () => void;
  isRunning?: boolean;
  onStop?: () => void;
}

/** model-picker: chip + optional custom trigger + dropdown slot. */
export interface ComposerModelPickerCapability {
  modelLabel?: string;
  onModelClick?: () => void;
  modelTrigger?: ReactNode;
  modelSelectorDropdown?: ReactNode;
}

/** tool-menu: add-menu items (file types or product actions). */
export interface ComposerToolMenuCapability {
  addMenuItems?: ComposerMenuItem[];
}

/** attachments: file picking + upload-to-media + tiles. */
export interface ComposerAttachmentsCapability {
  /** Placeholder attachment tiles for lab/demo use only. */
  showMockAttachments?: boolean;
}

/** voice: push-to-talk transcription via /api/voice/transcribe. */
export interface ComposerVoiceCapability {
  onVoiceTranscript?: (text: string) => void;
}

/** disabled-pending: setup-required / unavailable / in-flight states. */
export interface ComposerDisabledPendingCapability {
  disabled?: boolean;
}

/**
 * keyboard: Enter submits (Shift+Enter newline), Escape closes open menus,
 * outside pointer-down closes menus. Enforced inside the shell, not by
 * adapters.
 */
// Behavior-only capability — no props required.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ComposerKeyboardCapability {}

/** The full shared-shell capability surface (composition, not a monolith). */
export interface ComposerShellCapabilities
  extends ComposerTextEntryCapability,
    ComposerSendStopCapability,
    ComposerModelPickerCapability,
    ComposerToolMenuCapability,
    ComposerAttachmentsCapability,
    ComposerVoiceCapability,
    ComposerDisabledPendingCapability,
    ComposerKeyboardCapability {
  className?: string;
}
