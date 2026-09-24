/**
 * FJ-10 — Typed data-color palette authority.
 *
 * These are INTENTIONAL data-driven / semantic colors that must NOT be
 * migrated to generic theme surface tokens. They encode information
 * (file type, provider, status, diff direction) and are exempt from the
 * theme-literal validator (scripts/validate-theme-literals.ts).
 *
 * Program: FM-03 (Ethen Frontend Modernization) · Job: FJ-10
 * Authority: artifacts/frontend-modernization/checkpoints/FJ-10.md
 *
 * DO NOT add theme-surface colors here. Only data/status/provider colors.
 */

/** Attachment file-type icon colors (EthenComposerV3 attachment tiles). */
export const ATTACHMENT_TILE_COLORS = {
  img: "#4e8df5",
  pdf: "#f56942",
  json: "#a78bfa",
  audio: "#22c55e",
  video: "#f59e0b",
} as const;

/** Status colors that survive theme switching by design (CR-SOL-15 tokens). */
export const SEMANTIC_STATUS_COLORS = {
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
} as const;

/** Diff code-sample colors (static sample text, not live UI chrome). */
export const DIFF_SAMPLE_COLORS = {
  deletionBg: "rgba(220,38,38,0.12)",
  deletionText: "rgba(255,180,180,0.9)",
  additionBg: "rgba(22,163,74,0.12)",
  additionText: "rgba(190,255,205,0.9)",
} as const;

/**
 * Scrim overlays: bg-black/<alpha> modal/backdrop dims are intentionally
 * dark in BOTH themes (they sit above content). The light-mode block never
 * targeted them; the validator must not either.
 */
export const SCRIM_OVERLAY_PATTERN = /^bg-black\/(\d+|\[\d+\.?\d*\])$/;

/**
 * Data-viz palette authorities already typed in the codebase. The validator
 * trusts these modules' color literals as documented exceptions.
 */
export const TYPED_PALETTE_AUTHORITY_MODULES = [
  "components/model-intelligence/charts/providerColors.ts",
  "components/model-intelligence/charts/benchmarkChartUtils.ts",
  "components/model-intelligence/charts/chartSelection.ts",
  "components/model-intelligence/charts/DenseBarChart.tsx",
  "components/model-intelligence/charts/MiniBarChart.tsx",
  "components/model-intelligence/charts/StackedBarChart.tsx",
] as const;

/** Provider colors (typed authorities, informational). */
export const PROVIDER_COLOR_AUTHORITIES = {
  MI_PROVIDER_COLORS: "components/model-intelligence/charts/providerColors.ts",
  FLAT_PROVIDER_COLORS: "components/model-intelligence/charts/",
} as const;
