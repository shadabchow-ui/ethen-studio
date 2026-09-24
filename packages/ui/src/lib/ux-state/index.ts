/**
 * UXState — Core empty, loading, error, offline, and recovery state components.
 *
 * FE-03: Every flagship product route must have all five states.
 * These components ensure visual consistency across restored surfaces.
 */

import type { ReactNode } from "react";

// ── State identifiers ─────────────────────────────────────────────────

export type UXStateKind = "loading" | "empty" | "error" | "offline" | "recovery";

export interface UXStateProps {
  kind: UXStateKind;
  productName: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}

// ── State type maps ───────────────────────────────────────────────────

export interface ProductUXStates {
  loading: UXStateProps;
  empty: UXStateProps;
  error: UXStateProps;
  offline: UXStateProps;
  recovery: UXStateProps;
}

// ── Product state definitions ─────────────────────────────────────────

export function defaultProductStates(productName: string): ProductUXStates {
  return {
    loading: {
      kind: "loading",
      productName,
      message: "Loading...",
    },
    empty: {
      kind: "empty",
      productName,
      message: `No ${productName.toLowerCase()} data yet. Create something to get started.`,
    },
    error: {
      kind: "error",
      productName,
      message: `Something went wrong while loading ${productName.toLowerCase()}. Please try again.`,
    },
    offline: {
      kind: "offline",
      productName,
      message: `${productName} requires a network connection to operate.`,
    },
    recovery: {
      kind: "recovery",
      productName,
      message: `Recovering ${productName.toLowerCase()} session...`,
    },
  };
}

// ── Stock product states ─────────────────────────────────────────────

export const PRODUCT_UX_STATES: Record<string, ProductUXStates> = {
  research: {
    loading: { kind: "loading", productName: "Research", message: "Preparing your research workspace..." },
    empty: { kind: "empty", productName: "Research", message: "No research runs yet. Enter a question above to start." },
    error: { kind: "error", productName: "Research", message: "Research provider is unavailable. Check your API key configuration." },
    offline: { kind: "offline", productName: "Research", message: "Research requires network access to search and retrieve sources." },
    recovery: { kind: "recovery", productName: "Research", message: "Restoring your research session..." },
  },
  code: {
    loading: { kind: "loading", productName: "Code", message: "Loading your workspace..." },
    empty: { kind: "empty", productName: "Code", message: "No code projects yet. Open a repository to begin." },
    error: { kind: "error", productName: "Code", message: "Code runtime encountered an error. Please try again." },
    offline: { kind: "offline", productName: "Code", message: "Code agent requires a network connection." },
    recovery: { kind: "recovery", productName: "Code", message: "Recovering your coding session..." },
  },
  cortex: {
    loading: { kind: "loading", productName: "Ethen", message: "Initializing Cortex..." },
    empty: { kind: "empty", productName: "Ethen", message: "No conversations yet. Start a new session." },
    error: { kind: "error", productName: "Ethen", message: "Cortex is temporarily unavailable." },
    offline: { kind: "offline", productName: "Ethen", message: "Cortex requires network access." },
    recovery: { kind: "recovery", productName: "Ethen", message: "Restoring Cortex state..." },
  },
  sentinel: {
    loading: { kind: "loading", productName: "Security", message: "Loading security scanner..." },
    empty: { kind: "empty", productName: "Security", message: "No repositories configured. Add a repository to scan." },
    error: { kind: "error", productName: "Security", message: "Scanner encountered an error. Verify Semgrep is installed." },
    offline: { kind: "offline", productName: "Security", message: "Security requires network access to initialize." },
    recovery: { kind: "recovery", productName: "Security", message: "Restoring scan session..." },
  },
  voice: {
    loading: { kind: "loading", productName: "Voice", message: "Initializing voice services..." },
    empty: { kind: "empty", productName: "Voice", message: "No voice agents configured yet. Create one to begin." },
    error: { kind: "error", productName: "Voice", message: "Voice provider is unavailable. Check your configuration." },
    offline: { kind: "offline", productName: "Voice", message: "Voice services require a network connection." },
    recovery: { kind: "recovery", productName: "Voice", message: "Restoring voice session..." },
  },
  designer: {
    loading: { kind: "loading", productName: "Design", message: "Preparing design workspace..." },
    empty: { kind: "empty", productName: "Design", message: "No designs yet. Enter a brief to generate one." },
    error: { kind: "error", productName: "Design", message: "Design generation failed. Verify your Anthropic API key." },
    offline: { kind: "offline", productName: "Design", message: "Design requires network access for AI generation." },
    recovery: { kind: "recovery", productName: "Design", message: "Restoring design project..." },
  },
  computerUse: {
    loading: { kind: "loading", productName: "Operator", message: "Starting browser session..." },
    empty: { kind: "empty", productName: "Operator", message: "No browser sessions. Start one to begin." },
    error: { kind: "error", productName: "Operator", message: "Browser session failed. Check your sandbox configuration." },
    offline: { kind: "offline", productName: "Operator", message: "Browser automation requires network access." },
    recovery: { kind: "recovery", productName: "Operator", message: "Reconnecting to browser session..." },
  },
  automation: {
    loading: { kind: "loading", productName: "Flow", message: "Loading workflow engine..." },
    empty: { kind: "empty", productName: "Flow", message: "No workflows yet. Create a workflow to automate tasks." },
    error: { kind: "error", productName: "Flow", message: "Workflow execution failed. Check your connector configurations." },
    offline: { kind: "offline", productName: "Flow", message: "Flow requires network access." },
    recovery: { kind: "recovery", productName: "Flow", message: "Recovering workflow state..." },
  },
  studio: {
    loading: { kind: "loading", productName: "Studio", message: "Loading media workspace..." },
    empty: { kind: "empty", productName: "Studio", message: "No media projects yet. Create a new project." },
    error: { kind: "error", productName: "Studio", message: "Media generation failed. Check your provider configuration." },
    offline: { kind: "offline", productName: "Studio", message: "Studio requires network access for media generation." },
    recovery: { kind: "recovery", productName: "Studio", message: "Restoring media project..." },
  },
  gateway: {
    loading: { kind: "loading", productName: "Gateway", message: "Loading gateway configuration..." },
    empty: { kind: "empty", productName: "Gateway", message: "No API keys configured. Add a provider key to get started." },
    error: { kind: "error", productName: "Gateway", message: "Gateway encountered an error. Check provider configuration." },
    offline: { kind: "offline", productName: "Gateway", message: "Gateway requires network access." },
    recovery: { kind: "recovery", productName: "Gateway", message: "Restoring gateway state..." },
  },
};

/**
 * Get UX state definitions for a specific product.
 */
export function getProductUXStates(productKey: string): ProductUXStates | undefined {
  return PRODUCT_UX_STATES[productKey];
}

/**
 * Assert that a product has all five UX states defined.
 * Used by validation tests to ensure every route is covered.
 */
export function hasAllProductUXStates(productKey: string): boolean {
  const states = PRODUCT_UX_STATES[productKey];
  if (!states) return false;
  const kinds: UXStateKind[] = ["loading", "empty", "error", "offline", "recovery"];
  return kinds.every((kind) => {
    const state = states[kind];
    return state.kind === kind && !!state.productName && !!state.message;
  });
}

/**
 * List all registered products with complete UX states.
 */
export function getRegisteredUXProductKeys(): string[] {
  return Object.keys(PRODUCT_UX_STATES).filter(hasAllProductUXStates);
}
