/**
 * Studio V2 Job 12 (P0-2) — creative workspace slot contract.
 *
 * Extends the app-shell slot/factory architecture (see ../slots.tsx) with
 * first-class Studio workspace contracts. Shared packages own
 * contracts/primitives; apps/studio owns behavior. This module must never
 * import Studio application implementation (enforced by boundary tests).
 */

import type { ComponentType, ReactNode } from "react";

export interface StudioScopeProps {
  /** Canonical project scope. Tenant identity resolves via project scope. */
  projectId: string;
  /** Optional: no Studio slot reads it; tenant identity resolves via project scope. (M7A closure) */
  organizationId?: string;
  className?: string;
}

export interface StudioAssetPanelSlotProps extends StudioScopeProps {
  onSelectAsset?: (assetId: string) => void;
  onOpenLibrary?: () => void;
}

export interface StudioJobPanelSlotProps extends StudioScopeProps {
  jobId?: string | null;
  onOpenJob?: (jobId: string) => void;
}

export interface StudioPreviewStageSlotProps extends StudioScopeProps {
  /** One of SOURCE | PREVIEW | REVIEW | DELIVERY (see preview-delivery contract). */
  access: "source" | "preview" | "review" | "delivery";
  onOpenReview?: (token: string) => void;
}

export interface StudioReviewPanelSlotProps extends StudioScopeProps {
  reviewToken?: string | null;
  onVerdict?: (verdict: "accept" | "revise") => void;
}

export interface StudioCanvasToolbarSlotProps extends StudioScopeProps {
  canvasId?: string | null;
  onToolChange?: (toolId: string) => void;
}

export interface StudioHistoryPanelSlotProps extends StudioScopeProps {
  onOpenRun?: (runId: string) => void;
}

export interface StudioInspectorPanelSlotProps extends StudioScopeProps {
  onOpenDetail?: (section: string) => void;
}

export interface StudioComposerSlotProps extends StudioScopeProps {
  placeholder?: string;
  onSubmit?: (prompt: string) => void;
}

export interface StudioResultActionsSlotProps extends StudioScopeProps {
  outputId?: string | null;
  onExport?: () => void;
  onUseAsReference?: () => void;
}

export interface StudioWorkspaceSlots {
  AssetPanel: ComponentType<StudioAssetPanelSlotProps>;
  JobPanel: ComponentType<StudioJobPanelSlotProps>;
  PreviewStage: ComponentType<StudioPreviewStageSlotProps>;
  ReviewPanel: ComponentType<StudioReviewPanelSlotProps>;
  CanvasToolbar: ComponentType<StudioCanvasToolbarSlotProps>;
  HistoryPanel: ComponentType<StudioHistoryPanelSlotProps>;
  InspectorPanel: ComponentType<StudioInspectorPanelSlotProps>;
  Composer: ComponentType<StudioComposerSlotProps>;
  ResultActions: ComponentType<StudioResultActionsSlotProps>;
}

export type StudioWorkspaceSlotKey = keyof StudioWorkspaceSlots;

export const STUDIO_WORKSPACE_SLOT_KEYS: readonly StudioWorkspaceSlotKey[] = [
  "AssetPanel",
  "JobPanel",
  "PreviewStage",
  "ReviewPanel",
  "CanvasToolbar",
  "HistoryPanel",
  "InspectorPanel",
  "Composer",
  "ResultActions",
];

const studioRegistry: Partial<StudioWorkspaceSlots> = {};

/**
 * Register Studio's implementations. Call once from apps/studio boot; the
 * shared shell consumes contracts only.
 */
export function registerStudioWorkspaceSlots(slots: Partial<StudioWorkspaceSlots>): void {
  Object.assign(studioRegistry, slots);
}

function Empty(): ReactNode {
  return null;
}

/** Resolve one Studio slot; unregistered slots render nothing (never a fake panel). */
export function resolveStudioWorkspaceSlot<Key extends StudioWorkspaceSlotKey>(
  key: Key,
): StudioWorkspaceSlots[Key] {
  return studioRegistry[key] ?? (Empty as StudioWorkspaceSlots[Key]);
}

/** True when every creative slot has a Studio-supplied implementation. */
export function isStudioWorkspaceComplete(): boolean {
  return STUDIO_WORKSPACE_SLOT_KEYS.every((key) => studioRegistry[key] !== undefined);
}

/** Slot keys still missing a Studio implementation (empty when complete). */
export function missingStudioWorkspaceSlots(): StudioWorkspaceSlotKey[] {
  return STUDIO_WORKSPACE_SLOT_KEYS.filter((key) => studioRegistry[key] === undefined);
}
