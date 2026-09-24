"use client";

/**
 * D15-J02 — EDS flagship shell entry point (preview only).
 *
 * Production-usable composition of the EDS shell over the portfolio
 * authority: sidebar items and the fourteen launcher products are derived
 * from `CANONICAL_FLAGSHIP_RUNTIME_MAP`, never hard-coded. Unavailable
 * products reach the launcher without an `href`, so they render under
 * "In development" with no active affordance — exactly what F-01's
 * approved study depends on.
 *
 * No route renders this component yet. It exists so the successor shell
 * can be validated (targeted test) without any flagship route adopting
 * it. Route adoption is J03–J05 work.
 */
import * as React from "react";
import {
  EdsManagedShell,
  type EdsLauncherProduct,
  type EdsSidebarItem,
} from "@ethen/ui/design-system/eds/shell";
import type { IconName } from "@ethen/ui/icons";
import {
  CANONICAL_FLAGSHIP_RUNTIME_MAP,
  type FlagshipRuntimeMapping,
} from "@ethen/contracts/portfolio/flagship-map";
import type { ProductLifecycle } from "@ethen/contracts/portfolio/types";

const PRODUCT_ICONS: Readonly<Record<string, IconName>> = {
  "ethen-auto": "sparkle",
  research: "search",
  code: "terminal",
  "local-models": "models",
  "computer-use": "project",
  sentinel: "shield",
  studio: "star",
  voice: "chats",
  automation: "tasks",
  designer: "plus",
  founder: "authority",
  gateway: "permissions",
  "model-intelligence": "verification",
  "gpu-compute": "grid",
};

const RUNTIME_TYPE_GROUPS: Readonly<
  Record<FlagshipRuntimeMapping["runtimeType"], string>
> = {
  agent: "Agents",
  "gateway-adapter": "Platform",
  "local-model-server": "Local",
  "platform-service": "Services",
  "data-layer": "Intelligence",
};

const LIFECYCLE_LABELS: Readonly<Record<ProductLifecycle, string>> = {
  available: "Available",
  beta: "Beta",
  "private-beta": "Private beta",
  "private-alpha": "Private alpha",
  preview: "Preview",
  "setup-required": "Setup required",
  unavailable: "Unavailable",
  retired: "Retired",
};

const USABLE_LIFECYCLES: ReadonlySet<ProductLifecycle> = new Set([
  "available",
  "beta",
  "preview",
]);

/**
 * Products structurally frozen out of the public runtime. Mirrors the
 * default frozen set in `lib/portfolio/frozen-products.ts` (Voice and Flow
 * 404 without `ETHEN_ENABLE_FROZEN_PRODUCTS`). Explicit parameter so tests
 * and previews stay deterministic without reading process env on the client.
 */
export const DEFAULT_FROZEN_FLAGSHIP_IDS: readonly string[] = ["voice", "automation"];

export function isFlagshipLauncherAvailable(
  mapping: FlagshipRuntimeMapping,
  frozenIds: readonly string[] = DEFAULT_FROZEN_FLAGSHIP_IDS,
): boolean {
  if (!USABLE_LIFECYCLES.has(mapping.lifecycle)) return false;
  return !frozenIds.includes(mapping.id) && !frozenIds.includes(mapping.registryId);
}

export function flagshipProductIcon(mapping: FlagshipRuntimeMapping): IconName {
  return PRODUCT_ICONS[mapping.id] ?? PRODUCT_ICONS[mapping.registryId] ?? "grid";
}

/** All fourteen portfolio products as launcher entries; unavailable ones carry no href and render inert. */
export function buildEdsLauncherProducts(
  mappings: readonly FlagshipRuntimeMapping[] = CANONICAL_FLAGSHIP_RUNTIME_MAP,
  frozenIds: readonly string[] = DEFAULT_FROZEN_FLAGSHIP_IDS,
): readonly EdsLauncherProduct[] {
  return mappings.map((mapping) => {
    const available = isFlagshipLauncherAvailable(mapping, frozenIds);
    return {
      id: mapping.id,
      displayName: mapping.displayName,
      group: RUNTIME_TYPE_GROUPS[mapping.runtimeType],
      icon: flagshipProductIcon(mapping),
      ...(available ? { href: mapping.canonicalRoute } : null),
      lifecycleLabel: LIFECYCLE_LABELS[mapping.lifecycle],
      available,
    };
  });
}

/** Navigable (available) products as sidebar items. Unavailable products stay launcher-only. */
export function buildEdsSidebarItems(
  mappings: readonly FlagshipRuntimeMapping[] = CANONICAL_FLAGSHIP_RUNTIME_MAP,
  frozenIds: readonly string[] = DEFAULT_FROZEN_FLAGSHIP_IDS,
): readonly EdsSidebarItem[] {
  return mappings
    .filter((mapping) => isFlagshipLauncherAvailable(mapping, frozenIds))
    .map((mapping) => ({
      id: mapping.id,
      label: mapping.displayName,
      icon: flagshipProductIcon(mapping),
      href: mapping.canonicalRoute,
    }));
}

export interface EdsFlagshipShellProps {
  activeProductId?: string;
  frozenProductIds?: readonly string[];
  workspaceLabel?: string;
  onNavigate?: (item: EdsSidebarItem) => void;
  onLauncherSelect?: (product: EdsLauncherProduct) => void;
  /**
   * The shell's narrow-viewport convention: at or below 900px the inline
   * sidebar leaves the layout and the topbar menu button owns the drawer
   * instead. On by default (D15-J11B6); pass `false` only for a surface
   * that genuinely needs the inline sidebar at narrow widths.
   */
  hideSidebarOnNarrow?: boolean;
  children?: React.ReactNode;
}

export function EdsFlagshipShell({
  activeProductId,
  frozenProductIds,
  workspaceLabel,
  onNavigate,
  onLauncherSelect,
  hideSidebarOnNarrow = true,
  children,
}: EdsFlagshipShellProps) {
  const launcherProducts = React.useMemo(
    () => buildEdsLauncherProducts(CANONICAL_FLAGSHIP_RUNTIME_MAP, frozenProductIds),
    [frozenProductIds],
  );
  const sidebarItems = React.useMemo(
    () => buildEdsSidebarItems(CANONICAL_FLAGSHIP_RUNTIME_MAP, frozenProductIds),
    [frozenProductIds],
  );
  return (
    <EdsManagedShell
      sidebarItems={sidebarItems}
      launcherProducts={launcherProducts}
      activeItemId={activeProductId}
      onNavigate={onNavigate}
      onLauncherSelect={onLauncherSelect}
      workspaceLabel={workspaceLabel}
      hideSidebarOnNarrow={hideSidebarOnNarrow}
    >
      {children}
    </EdsManagedShell>
  );
}
