"use client";

import {
  registerStudioWorkspaceSlots,
  isStudioWorkspaceComplete,
} from "@ethen/app-shell";
import { StudioAssetPanelSlot } from "./StudioAssetPanelSlot";
import { StudioJobPanelSlot } from "./StudioJobPanelSlot";
import { StudioPreviewStageSlot } from "./StudioPreviewStageSlot";
import { StudioReviewPanelSlot } from "./StudioReviewPanelSlot";
import { StudioCanvasToolbarSlot } from "./StudioCanvasToolbarSlot";
import { StudioHistoryPanelSlot } from "./StudioHistoryPanelSlot";
import { StudioInspectorPanelSlot } from "./StudioInspectorPanelSlot";
import { StudioComposerSlot } from "./StudioComposerSlot";
import { StudioResultActionsSlot } from "./StudioResultActionsSlot";

/**
 * Studio V2 Job 13 — workspace slot boot.
 *
 * Registers Studio's nine production slot implementations with the shared
 * shell contract. Imported once from the workbench layout's client boot
 * component; importing the module performs registration. Safe to import
 * multiple times (registration is idempotent assignment).
 */

registerStudioWorkspaceSlots({
  AssetPanel: StudioAssetPanelSlot,
  JobPanel: StudioJobPanelSlot,
  PreviewStage: StudioPreviewStageSlot,
  ReviewPanel: StudioReviewPanelSlot,
  CanvasToolbar: StudioCanvasToolbarSlot,
  HistoryPanel: StudioHistoryPanelSlot,
  InspectorPanel: StudioInspectorPanelSlot,
  Composer: StudioComposerSlot,
  ResultActions: StudioResultActionsSlot,
});

export function isStudioWorkspaceBooted(): boolean {
  return isStudioWorkspaceComplete();
}
