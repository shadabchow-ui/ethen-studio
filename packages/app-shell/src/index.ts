/**
 * `@ethen/app-shell` — shared application chrome (U02-A closure).
 *
 * Physically owns AppShell, ConsoleLayout, the sidebars, the command palette
 * and the EDS system/flagship shells. The package has zero imports from the
 * root monolith: product surfaces the shell frames are supplied by the host
 * through `registerAppShellSlots`.
 */

export const PACKAGE_NAME = "@ethen/app-shell" as const;
export const EXTRACTION_STATUS = "extracted" as const;

export { AppShell } from "./AppShell";
export { ConsoleLayout } from "./ConsoleLayout";
export { Sidebar } from "./Sidebar";
export { PlatformSidebar } from "./PlatformSidebar";
export { MobileSidebar } from "./MobileSidebar";
export { CommandPalette } from "./CommandPalette";
export { EdsSystemShell } from "./EdsSystemShell";
export { EdsFlagshipShell } from "./EdsFlagshipShell";
export { Workspace } from "./Workspace";
export { ThemeToggle } from "./ThemeToggle";
export { ShellStatusBar } from "./ShellStatusBar";
export { ModelStatusChip } from "./ModelStatusChip";
export { DisabledReason } from "./DisabledReason";
export { CompactIconRail } from "./CompactIconRail";
export { NavItem, ICONS } from "./NavItem";

export {
  registerAppShellSlots,
  COMPOSER_PREFILL_EVENT,
} from "./slots";
export type {
  AppShellSlots,
  WorkspaceFactory,
  WorkspaceRenderProps,
  SerializedMessage,
} from "./slots";

export {
  registerStudioWorkspaceSlots,
  resolveStudioWorkspaceSlot,
  isStudioWorkspaceComplete,
  missingStudioWorkspaceSlots,
} from "./studio/studio-workspace-slots";
export type {
  StudioWorkspaceSlots,
  StudioWorkspaceSlotKey,
  StudioAssetPanelSlotProps,
  StudioJobPanelSlotProps,
  StudioPreviewStageSlotProps,
  StudioReviewPanelSlotProps,
  StudioCanvasToolbarSlotProps,
  StudioHistoryPanelSlotProps,
  StudioInspectorPanelSlotProps,
  StudioComposerSlotProps,
  StudioResultActionsSlotProps,
} from "./studio/studio-workspace-slots";

// B1 — shared document + auth foundation.
export { EthenDocument } from "./document";
export type { EthenDocumentProps } from "./document";
export { EthenAuthProvider, isClerkConfigured } from "./auth-provider";
export type { EthenAuthProviderProps } from "./auth-provider";
