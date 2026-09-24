/**
 * Design Lab 2's reusable V2 geometry contract — canonical for DL2-02.
 * Production surfaces consume these values without depending on the lab
 * route. Token authority for color/type/motion is `packages/ui/src/styles/ethen-v2/tokens.css`
 * only. There is no foundation-theme.css V2 block.
 */
export const V2_GEOMETRY = {
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
  radiusBase: 6,
  radiusRaised: 12,
  radiusLarge: 16,
  radiusPill: 999,
} as const;

export const V2_SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48] as const;

export type V2GeometryToken = keyof typeof V2_GEOMETRY;