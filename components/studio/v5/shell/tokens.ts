/**
 * STUDIO_08 — Studio-scoped token adapter (VISUAL-01 extended).
 *
 * Maps Studio V5 components onto the shared Ethen token scale without
 * editing global Chat behavior or the design system. Fallbacks are
 * intentional and neutral; no competitor dimensions or colors.
 *
 * VISUAL-01 adds Studio-semantic surface/elevation/type/media aliases
 * over the same Ethen tokens — one visual foundation, not a competing
 * design system. All values reference theme tokens; no hardcoded colors.
 */

export const STUDIO_TOKENS = {
  bgBase: "var(--bg-base)",
  bgSurface: "var(--bg-surface)",
  bgElevated: "var(--bg-elevated)",
  bgInset: "var(--bg-inset)",
  border: "var(--border-default)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary: "var(--text-tertiary)",
  accent: "var(--accent)",
} as const;

/**
 * VISUAL-01 — semantic Studio surfaces. Luminance separation between
 * levels must be perceptible before borders; borders stay low-contrast
 * separators, never outlines around every region.
 */
export const STUDIO_SURFACES = {
  /** Page canvas. */
  base: "var(--bg-base)",
  /** Cards, rails, headers. */
  raised: "var(--bg-elevated)",
  /** Drawers, modals, floating action bars. */
  floating: "var(--bg-elevated)",
  /** Wells, media fallbacks, recessed previews. */
  inset: "var(--bg-inset)",
  /** Quiet grouped rows inside a raised surface. */
  sunken: "var(--bg-surface)",
} as const;

/** VISUAL-01 — Studio type scale (authority: weight/scale/whitespace first). */
export const STUDIO_TYPE = {
  display: "text-[32px] leading-[1.08] tracking-[-0.02em] sm:text-[36px]",
  pageTitle: "text-[24px] leading-[1.12] tracking-[-0.015em] sm:text-[28px]",
  section: "text-[16px] leading-[1.35] sm:text-[18px]",
  body: "text-[13px] leading-[1.55] sm:text-[14px]",
  meta: "text-[11px] leading-[1.45] sm:text-[12px]",
} as const;

/** VISUAL-01 — radii: 8 controls, 12 inputs/rows, 16 cards, 20–24 feature media. */
export const STUDIO_RADIUS = {
  control: "rounded-[8px]",
  input: "rounded-[12px]",
  card: "rounded-[16px]",
  feature: "rounded-[20px]",
} as const;

/** VISUAL-01 — motion: 120–180ms controls, 180–240ms drawers, no perpetual decoration. */
export const STUDIO_MOTION = {
  control: "transition-[background-color,border-color,color] duration-150",
  drawer: "transition-transform duration-200",
  reduceMotion: "motion-reduce:transition-none motion-reduce:animate-none",
} as const;

/** VISUAL-01 — media treatment: lazy below-fold, posters, reserved dimensions. */
export const STUDIO_MEDIA = {
  aspectCard: "aspect-[4/3]",
  aspectWide: "aspect-[16/9]",
  image: "h-full w-full object-cover",
} as const;

/** Studio rhythm from authority §17: 4/8/12/16/24/32 with 44px targets. */
export const STUDIO_SPACING = [4, 8, 12, 16, 24, 32] as const;
export const STUDIO_TOUCH_TARGET_PX = 44;
export const STUDIO_CONTENT_MAX_PX = 1320;

/** V-ui capture widths. */
export const STUDIO_WIDTHS = [375, 430, 768, 1440] as const;

export const STUDIO_FOCUS_RING_CLASS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]";

/**
 * M6B — the one page frame for non-generator Studio surfaces: a centred
 * STUDIO_CONTENT_MAX_PX column with a 16/24/32px gutter on the 4px grid.
 * Generators stay flush (their stage owns the viewport).
 */
export const STUDIO_PAGE_CLASS = "mx-auto w-full max-w-[1320px] px-4 pb-16 pt-6 sm:px-6 lg:px-8";
