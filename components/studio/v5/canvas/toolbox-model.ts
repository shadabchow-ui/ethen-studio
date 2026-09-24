/**
 * STUDIO_13 — typed node toolbox model (client-safe).
 * Mirrors the server registry descriptors without importing server code:
 * eight authoring kinds, forbidden kinds rejected with an explanation.
 */

import { CANVAS_MEDIA_TYPES } from "@ethen/studio-core/contracts";

export interface ToolboxKind {
  kind: string;
  label: string;
  description: string;
  requiresTask: boolean;
  allowsChildren: boolean;
}

export const TOOLBOX_KINDS: readonly ToolboxKind[] = [
  { kind: "task", label: "Task", description: "One canonical task with pinned versions.", requiresTask: true, allowsChildren: false },
  { kind: "transform", label: "Transform", description: "Deterministic local transform, no provider call.", requiresTask: false, allowsChildren: false },
  { kind: "select", label: "Select", description: "Select one validated input branch.", requiresTask: false, allowsChildren: false },
  { kind: "branch", label: "Branch", description: "Bounded branch with child bodies.", requiresTask: false, allowsChildren: true },
  { kind: "map", label: "Map", description: "Bounded map over a list input.", requiresTask: false, allowsChildren: true },
  { kind: "composition", label: "Composition", description: "Named reusable sub-assembly.", requiresTask: false, allowsChildren: true },
  { kind: "input", label: "Input", description: "Workflow input binding (app form source).", requiresTask: false, allowsChildren: false },
  { kind: "output", label: "Output", description: "Workflow output binding (app result).", requiresTask: false, allowsChildren: false },
];

export const FORBIDDEN_KIND_HELP: Readonly<Record<string, string>> = {
  code: "Custom code nodes are not supported; use a Task or Transform node.",
  schedule: "Scheduling nodes are not supported; runs start explicitly.",
  loop: "Unbounded loops are not supported; use a bounded Map node.",
};

export function toolboxKind(kind: string): ToolboxKind | null {
  return TOOLBOX_KINDS.find((entry) => entry.kind === kind) ?? null;
}

/** Accessible port-type label: media + unit, never color alone. */
export function portTypeLabel(mediaType: string, unit: string | null): string {
  const known = (CANVAS_MEDIA_TYPES as readonly string[]).includes(mediaType);
  const media = known ? mediaType : "unknown";
  return unit ? `${media} · ${unit}` : media;
}
