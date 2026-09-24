/**
 * STUDIO_08 — shared shell barrel. All V5 UI jobs import shared
 * primitives from here exactly once; forking is not permitted.
 */
export * from "./types";
export * from "./tokens";
export * from "./navigation-model";
export * from "./project-context-model";
export { StudioEmptyState, StudioErrorState, StudioLoadingState } from "./states";
export { StudioSetupState, setupDependencyLabel } from "./StudioSetupState";
export { StudioPageHeader } from "./PageHeader";
export { StudioMediaCard, StudioAudioRow } from "./media";
export { StudioInspectorDrawer } from "./InspectorDrawer";
export { StudioLibraryFrame } from "./LibraryFrame";
export { StudioNavigation } from "./StudioNavigation";
export { StudioProjectContextBar, ensureDefaultProjectClient } from "./ProjectContext";
