import * as React from "react";
import { cn } from "../lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LiquidGlassPanelVariant =
  | "panel"
  | "composer"
  | "control"
  | "floating"
  | "header"
  | "media";

export type LiquidGlassPanelIntensity = "low" | "medium" | "high";
export type LiquidGlassPanelRadius = "md" | "lg" | "xl" | "blob";
export type LiquidGlassPanelMaterial = "dark" | "clear" | "smoked";

export interface LiquidGlassPanelProps
  extends React.HTMLAttributes<HTMLDivElement> {
  variant?: LiquidGlassPanelVariant;
  intensity?: LiquidGlassPanelIntensity;
  radius?: LiquidGlassPanelRadius;
  /** "dark" (restrained chrome, default), "clear" (frosted, translucent), or "smoked" (jet-black translucent with sharp rim light). */
  material?: LiquidGlassPanelMaterial;
  /** Adds hover/active transitions (border, shadow, lift). Blur is never animated. */
  interactive?: boolean;
  contentClassName?: string;
  children?: React.ReactNode;
}

// ─── Per-variant base config (at medium intensity) ──────────────────────────

interface VariantCfg {
  /** Backdrop blur in px */
  blur: number;
  /** Background fill opacity 0–1 */
  fillAlpha: number;
  /** Radial specular glare opacity */
  glare: number;
  /** Inner top-edge inset highlight opacity */
  edge: number;
  shadow: string;
  border: string;
  borderHover: string;
}

const VARIANT_CONFIG: Record<LiquidGlassPanelVariant, VariantCfg> = {
  panel: {
    blur: 16,
    fillAlpha: 0.88,
    glare: 0.055,
    edge: 0.06,
    shadow: "0 16px 48px rgba(0,0,0,0.40), 0 4px 12px rgba(0,0,0,0.28)",
    border: "rgba(255,255,255,0.08)",
    borderHover: "rgba(255,255,255,0.13)",
  },
  composer: {
    blur: 24,
    fillAlpha: 0.82,
    glare: 0.07,
    edge: 0.08,
    shadow: "0 24px 64px rgba(0,0,0,0.48), 0 6px 16px rgba(0,0,0,0.32)",
    border: "rgba(255,255,255,0.095)",
    borderHover: "rgba(255,255,255,0.15)",
  },
  control: {
    blur: 10,
    fillAlpha: 0.92,
    glare: 0.04,
    edge: 0.05,
    shadow: "0 4px 16px rgba(0,0,0,0.28), 0 1px 4px rgba(0,0,0,0.20)",
    border: "rgba(255,255,255,0.08)",
    borderHover: "rgba(255,255,255,0.13)",
  },
  floating: {
    blur: 20,
    fillAlpha: 0.84,
    glare: 0.065,
    edge: 0.07,
    shadow: "0 20px 60px rgba(0,0,0,0.48), 0 4px 16px rgba(0,0,0,0.32)",
    border: "rgba(255,255,255,0.095)",
    borderHover: "rgba(255,255,255,0.15)",
  },
  header: {
    blur: 12,
    fillAlpha: 0.94,
    glare: 0.04,
    edge: 0.05,
    shadow: "0 2px 8px rgba(0,0,0,0.32)",
    border: "rgba(255,255,255,0.08)",
    borderHover: "rgba(255,255,255,0.12)",
  },
  media: {
    blur: 16,
    fillAlpha: 0.78,
    glare: 0.06,
    edge: 0.055,
    shadow: "0 16px 48px rgba(0,0,0,0.44)",
    border: "rgba(255,255,255,0.07)",
    borderHover: "rgba(255,255,255,0.12)",
  },
};

// ─── Intensity multipliers ───────────────────────────────────────────────────

const INTENSITY_MULT: Record<LiquidGlassPanelIntensity, number> = {
  low: 0.55,
  medium: 1.0,
  high: 1.55,
};

// ─── Radius map ─────────────────────────────────────────────────────────────

const RADIUS_MAP: Record<LiquidGlassPanelRadius, string> = {
  md: "12px",
  lg: "16px",
  xl: "24px",
  blob: "32px 44px 36px 40px / 40px 36px 44px 32px",
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * LiquidGlassPanel — premium Liquid Glass material primitive.
 *
 * Pseudo-element stacking (defined in globals.css .lgp-base):
 *   ::before  z-index 0  specular radial glare
 *   ::after   z-index 1  inner top-edge inset highlight
 *   .lgp-content z-index 2  children
 *
 * Blur is set as a CSS variable and is never animated for performance.
 */
export const LiquidGlassPanel = React.forwardRef<
  HTMLDivElement,
  LiquidGlassPanelProps
>(
  (
    {
      variant = "panel",
      intensity = "medium",
      radius = "lg",
      material = "dark",
      interactive = false,
      className,
      contentClassName,
      children,
      style,
      ...props
    },
    ref,
  ) => {
    const cfg = VARIANT_CONFIG[variant];
    const mult = INTENSITY_MULT[intensity];
    const isClear = material === "clear";
    const isSmoked = material === "smoked";

    // Blur: clamped 4–32 px (smoked caps lower for a sharper, retina-crisp edge); never animated
    const blurPx = isSmoked
      ? Math.round(Math.min(22, Math.max(8, cfg.blur * mult)))
      : Math.round(Math.min(32, Math.max(4, cfg.blur * mult)));
    // Glare and edge scale linearly with multiplier
    const glareFrac = Number(Math.min(0.14, cfg.glare * mult).toFixed(3));
    const edgeFrac  = Number(Math.min(0.16, cfg.edge  * mult).toFixed(3));

    // Dark material: restrained, near-opaque chrome fill
    const darkFillAlpha = Math.min(
      0.9,
      Math.max(0.62, cfg.fillAlpha + (mult - 1) * 0.035),
    );

    // Clear material: milky, frosted, see-through — alpha stays low even at "high"
    const clearFillAlphaByIntensity: Record<LiquidGlassPanelIntensity, number> = {
      low: 0.075,
      medium: 0.115,
      high: 0.165,
    };
    const clearBorderByIntensity: Record<LiquidGlassPanelIntensity, string> = {
      low: "rgba(255,255,255,0.16)",
      medium: "rgba(255,255,255,0.22)",
      high: "rgba(255,255,255,0.30)",
    };

    // Smoked material: jet-black translucent fill with a thin, crisp inset bevel
    const smokedFillByIntensity: Record<LiquidGlassPanelIntensity, string> = {
      low: "rgba(3,3,3,0.40)",
      medium: "rgba(3,3,3,0.52)",
      high: "rgba(3,3,3,0.60)",
    };
    const smokedBorderByIntensity: Record<LiquidGlassPanelIntensity, string> = {
      low: "rgba(255,255,255,0.055)",
      medium: "rgba(255,255,255,0.085)",
      high: "rgba(255,255,255,0.105)",
    };
    // Visible-but-controlled smoked rim: a light top/side inset bevel + dark
    // bottom inset + 0.5px hairline ring. This is the 12:59 AM balance point.
    const smokedShadow =
      "inset 0 1px 0 rgba(255,255,255,0.26), inset 1px 0 0 rgba(255,255,255,0.055), inset 0 -1px 0 rgba(0,0,0,0.92), inset -1px 0 0 rgba(0,0,0,0.60), 0 0 0 0.5px rgba(255,255,255,0.08), 0 24px 72px rgba(0,0,0,0.62)";

    const fillAlpha = isClear
      ? clearFillAlphaByIntensity[intensity]
      : darkFillAlpha;

    const cssVars: Record<string, string | number> = {
      "--lgp-blur": `${blurPx}px`,
      "--lgp-fill": isSmoked
        ? smokedFillByIntensity[intensity]
        : isClear
          ? `rgba(255,255,255,${fillAlpha.toFixed(3)})`
          : `rgba(10,10,10,${fillAlpha.toFixed(2)})`,
      "--lgp-glare": isSmoked ? Math.min(0.045, glareFrac * 0.45) : isClear ? Math.min(0.28, glareFrac * 2.2) : glareFrac,
      "--lgp-edge": isSmoked ? Math.min(0.22, edgeFrac * 1.45) : isClear ? Math.min(0.34, edgeFrac * 2.4) : edgeFrac,
      "--lgp-radius": RADIUS_MAP[radius],
      "--lgp-shadow": isSmoked
        ? smokedShadow
        : isClear
          ? "inset 1px 1px 0 rgba(255,255,255,0.32), inset -1px -1px 0 rgba(0,0,0,0.38), inset 0 0 26px rgba(255,255,255,0.10), 0 24px 80px rgba(0,0,0,0.34)"
          : cfg.shadow,
      "--lgp-border": isSmoked ? smokedBorderByIntensity[intensity] : isClear ? clearBorderByIntensity[intensity] : cfg.border,
      "--lgp-border-hover": isSmoked ? "rgba(255,255,255,0.20)" : isClear ? "rgba(255,255,255,0.38)" : cfg.borderHover,
      "--lgp-saturate": isSmoked ? 1.35 : isClear ? 1.65 : 1.18,
      "--lgp-brightness": isSmoked ? 0.92 : isClear ? 1.08 : 1,
      "--lgp-contrast": isSmoked ? 1.12 : 1,
    };

    return (
      <div
        ref={ref}
        className={cn("lgp-base", interactive && "lgp-interactive", className)}
        style={{ ...(cssVars as React.CSSProperties), ...style }}
        {...props}
      >
        <div className={cn("lgp-content", contentClassName)}>{children}</div>
      </div>
    );
  },
);

LiquidGlassPanel.displayName = "LiquidGlassPanel";
