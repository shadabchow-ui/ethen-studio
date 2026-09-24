export { WorkspacePattern, type WorkspacePatternProps, type WorkspaceMode, type WorkspaceView } from "./WorkspacePattern";
export {
  ArtifactSurface,
  ARTIFACT_KINDS,
  MAX_VISIBLE_ARTIFACT_TABS,
  versionLabel,
  type ArtifactContent,
  type ArtifactKind,
  type ArtifactTab,
} from "./ArtifactSurface";
export {
  EvidenceRail,
  EVIDENCE_SECTIONS,
  type EvidenceCheck,
  type EvidenceCheckState,
  type EvidencePresentation,
  type EvidenceRailProps,
  type EvidenceSection,
  type EvidenceSectionData,
  type EvidenceSource,
} from "./EvidenceRail";
export { EvidenceAffordance, type EvidenceAffordanceProps } from "./EvidenceAffordance";
export {
  EVIDENCE_OVERLAY_MIN_WIDTH,
  EVIDENCE_OVERLAY_QUERY,
  EVIDENCE_RAIL_MIN_WIDTH,
  EVIDENCE_RAIL_QUERY,
  EVIDENCE_RAIL_WIDE_WIDTH,
  presentationForWidth,
  useEvidencePresentation,
} from "./evidence-presentation";
export { EvidenceHost, type EvidenceHostProps } from "./EvidenceHost";
export {
  DIVIDER_DEFAULT_WIDTH,
  DIVIDER_MAX_WIDTH,
  DIVIDER_MIN_WIDTH,
  DIVIDER_STEP,
  clampDividerWidth,
  loadDividerWidth,
  saveDividerWidth,
} from "./divider-preference";
