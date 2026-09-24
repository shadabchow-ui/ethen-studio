// Lightweight normalization/readiness helpers for workbench seed data.
// Normalizes string arrays from WorkbenchRequirement into implementation-ready
// shapes for future workbench registry and UI layers.
// Does NOT implement runtime execution, mock runners, or workbench UI.

import {
  WORKBENCH_REQUIREMENTS,
  type WorkbenchRequirement,
} from "./workbench-requirements";

export function getWorkbenchRequirement(slug: string): WorkbenchRequirement | undefined {
  return WORKBENCH_REQUIREMENTS.find((r) => r.slug === slug);
}

export function listWorkbenchRequirements(): WorkbenchRequirement[] {
  return WORKBENCH_REQUIREMENTS;
}

export function hasWorkbenchRequirement(slug: string): boolean {
  return WORKBENCH_REQUIREMENTS.some((r) => r.slug === slug);
}

/** Derive a stable action ID from a human-readable action label. */
export function deriveWorkbenchActionId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Derive a stable tool ID from a tool name string. */
export function deriveToolId(toolName: string): string {
  return toolName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Check if a given action label is approval-gated in the given requirement. */
export function isApprovalGatedAction(
  requirement: WorkbenchRequirement,
  actionLabel: string,
): boolean {
  return requirement.approvalGatedActions.some((gated) =>
    actionLabel.toLowerCase().includes(gated.toLowerCase()),
  );
}

/** Get a representative action for a workbench (first primary action). */
export function getRepresentativeWorkbenchAction(slug: string): string | null {
  const wb = getWorkbenchRequirement(slug);
  if (!wb || wb.primaryActions.length === 0) return null;
  return wb.primaryActions[0];
}

/** Normalize action labels into an array of { id, label, requiresApproval }. */
export function normalizeWorkbenchActionLabels(
  requirement: WorkbenchRequirement,
): Array<{ id: string; label: string; requiresApproval: boolean }> {
  return requirement.primaryActions.map((label) => ({
    id: deriveWorkbenchActionId(label),
    label,
    requiresApproval: isApprovalGatedAction(requirement, label),
  }));
}

/** Normalize core tool names into an array of { id, name }. */
export function normalizeCoreTools(
  requirement: WorkbenchRequirement,
): Array<{ id: string; name: string }> {
  return requirement.coreTools.map((name) => ({
    id: deriveToolId(name),
    name,
  }));
}
