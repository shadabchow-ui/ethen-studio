/**
 * EDS geometry authority — D04 candidate.
 *
 * Carries the frozen V2 geometry forward unchanged (read-only source:
 * components/design-system/v2/geometry.ts) and layers the EDS additions:
 * radius 8, spacing 64, semantic spacing, four elevation tiers, focus ring,
 * three-signal active state and density targets. Lab-scoped only.
 */
import geometryCandidate from "../../design-tokens/tokens/eds-geometry-candidate.json";
import motionCandidate from "../../design-tokens/tokens/eds-motion-candidate.json";

export const EDS_GEOMETRY = {
  sidebar: 256,
  sidebarCollapsed: 56,
  topbar: 56,
  navRow: 36,
  controlSmall: 32,
  controlMedium: 40,
  controlLarge: 48,
  pageGutter: 24,
  pageGap: 24,
  contextRail: 320,
  contextRailWide: 404,
} as const;

export const EDS_RADII = {
  base: 6,
  small: 8,
  raised: 12,
  large: 16,
  pill: 999,
} as const;

export const EDS_PILL_ALLOWED_CLASSES = [
  "avatar",
  "switch",
  "toggle-track",
  "removable-tag",
  "status-dot",
] as const;

export const EDS_SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

export const EDS_SEMANTIC_SPACING = {
  compact: 4,
  tight: 8,
  default: 16,
  comfortable: 24,
  spacious: 32,
  section: 48,
  page: 64,
} as const;

export const EDS_ELEVATION_TIERS = ["base", "raised", "overlay", "sunken"] as const;

export type EdsElevationTier = (typeof EDS_ELEVATION_TIERS)[number];

export const EDS_MOTION = {
  instant: 80,
  press: 100,
  ui: 150,
  panel: 200,
  page: 220,
  deliberate: 320,
} as const;

export const EDS_DELIBERATE_ALLOWED_SURFACES = [
  "approval",
  "execution",
  "receipt",
  "irreversible-action",
] as const;

export const EDS_GEOMETRY_CANDIDATE = geometryCandidate;
export const EDS_MOTION_CANDIDATE = motionCandidate;
