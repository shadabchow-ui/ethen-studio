/**
 * Studio V2 Job 12 (P0-1) — canonical Studio production shell stack.
 *
 * Contract only: no chrome, no Studio application imports. This module names
 * the single Studio production stack and who owns each shell concern, so the
 * later visual migration cannot fork geometry, tokens, overlays, or scroll
 * ownership.
 *
 * Canonical stack:
 *   AppShell (@ethen/app-shell)
 *     → ConsoleShell (@ethen/ui/design-system/v2/shells/ConsoleShell)
 *       → StudioShell children passthrough (@ethen/ui/design-system/v2/shells/StudioShell)
 *         → Studio-owned workbench slots (registered by apps/studio)
 *   wrapped in V2ProductionScope + EdsScope (theme/scope activation only).
 *
 * Competing frames (EthenConsoleShell, EdsManagedShell, FlagshipConsoleShell)
 * remain valid for their own products; they are NOT Studio authorities and
 * must not be adopted for Studio routes.
 */

import { V2_GEOMETRY } from "@ethen/ui/design-system/v2/geometry";

export const STUDIO_CANONICAL_SHELL_STACK = [
  "AppShell",
  "ConsoleShell",
  "StudioShell(children)",
  "Studio-owned workbench slots",
] as const;

export type StudioShellStackLayer = (typeof STUDIO_CANONICAL_SHELL_STACK)[number];

/**
 * Single owner per shell concern on Studio routes. "Shared" means the named
 * canonical module, never a per-product fork.
 */
export const STUDIO_SHELL_OWNERSHIP = {
  leftNavigationGeometry: "ConsoleShell (V2_GEOMETRY.sidebar 256 / collapsed 56)",
  topBarGeometry: "ConsoleShell (V2_GEOMETRY.topbar 56)",
  thirdColumnGeometry: "ConsoleShell contextRail (320 / 404)",
  overlayBehavior: "useOverlay + console-overlay-hooks (trap, restore, body lock, Escape order)",
  scrollOwnership: "ConsoleShell frame; canvas panels own panel scroll via scrollOwner=panel",
  responsiveBehavior: "ConsoleShell breakpoints (sidebar md, rail xl) + Studio panel-collapse contract",
  theme: "theme-store (ethen-theme) + V2ProductionScope/EdsScope activation",
  tokens: "EDS eds-global.css for color/type/motion; V2_GEOMETRY for geometry",
  zIndex: "overlay scale owned by console-overlay-hooks/Dialog (dialog 60, palette 70)",
  dialogs: "ConsoleDialog / EdsDialog via useOverlay",
  commandPalette: "Studio-aware palette contract deriving from portfolio registry (Job 12 P1)",
} as const;

export type StudioShellOwnershipKey = keyof typeof STUDIO_SHELL_OWNERSHIP;

/** Geometry the canonical stack must honor (mirrors V2_GEOMETRY; asserted below). */
export const STUDIO_SHELL_GEOMETRY = {
  sidebar: 256,
  sidebarCollapsed: 56,
  topbar: 56,
  contextRail: 320,
  contextRailWide: 404,
  pageGutter: 24,
} as const;

export interface StudioShellStackIssue {
  key: string;
  message: string;
}

/**
 * Pure structural assertion: the canonical stack references live geometry
 * (not a forked copy) and names every required ownership key.
 */
export function assertStudioShellStack(input?: {
  layers?: readonly string[];
  geometry?: Record<string, number>;
  ownershipKeys?: readonly string[];
}): StudioShellStackIssue[] {
  const issues: StudioShellStackIssue[] = [];
  const layers = input?.layers ?? STUDIO_CANONICAL_SHELL_STACK;
  for (const required of STUDIO_CANONICAL_SHELL_STACK) {
    if (!layers.includes(required)) {
      issues.push({ key: "layers", message: `canonical stack is missing layer: ${required}` });
    }
  }
  const geometry = input?.geometry ?? { ...V2_GEOMETRY };
  for (const [key, expected] of Object.entries(STUDIO_SHELL_GEOMETRY)) {
    if ((geometry as Record<string, number>)[key] !== expected) {
      issues.push({ key: `geometry.${key}`, message: `geometry fork: ${key} is not ${expected}` });
    }
  }
  const ownershipKeys = input?.ownershipKeys ?? Object.keys(STUDIO_SHELL_OWNERSHIP);
  for (const required of Object.keys(STUDIO_SHELL_OWNERSHIP)) {
    if (!ownershipKeys.includes(required)) {
      issues.push({ key: "ownership", message: `shell concern has no single owner: ${required}` });
    }
  }
  return issues;
}
