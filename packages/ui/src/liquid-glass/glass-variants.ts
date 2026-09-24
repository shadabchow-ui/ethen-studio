export type LiquidGlassVariant =
  | "subtle"
  | "standard"
  | "strong"
  | "interactive";

export const GLASS_VARIANT_CLASS: Record<LiquidGlassVariant, string> = {
  subtle: "ethen-glass-subtle",
  standard: "ethen-glass-standard",
  strong: "ethen-glass-strong",
  interactive: "ethen-glass-interactive",
};

export const GLASS_BASE_CLASS = "ethen-glass";

export type EthenPanelSurfaceVariant =
  | "smoked"
  | "smokedRefined"
  | "smokedQuiet"
  | "solidDark"
  | "solidBlack";

export const ETHEN_PANEL_SURFACE_CLASS: Record<EthenPanelSurfaceVariant, string> = {
  smoked: "ethen-panel-smoked",
  smokedRefined: "ethen-panel-smoked-refined",
  smokedQuiet: "ethen-panel-smoked-quiet",
  solidDark: "ethen-panel-solid-dark",
  solidBlack: "ethen-panel-solid-black",
};

export type EthenModalSurfaceVariant =
  | "default"
  | "smoked"
  | "smokedRefined"
  | "solidDark";

export const ETHEN_MODAL_SURFACE_CLASS: Record<EthenModalSurfaceVariant, string> = {
  default: "",
  smoked: ETHEN_PANEL_SURFACE_CLASS.smoked,
  smokedRefined: ETHEN_PANEL_SURFACE_CLASS.smokedRefined,
  solidDark: ETHEN_PANEL_SURFACE_CLASS.solidDark,
};
