// Workbench config registry — built once from the repaired seed.
// Provides lookup functions by slug, category, and template family.

import type { WorkbenchActionConfig, FunctionalAgentWorkbenchConfig } from "./config-types";
import { buildAllWorkbenchConfigs } from "./config-derivation";

const _configs: FunctionalAgentWorkbenchConfig[] = buildAllWorkbenchConfigs();
const _bySlug = new Map<string, FunctionalAgentWorkbenchConfig>();
for (const c of _configs) {
  _bySlug.set(c.slug, c);
}

export const WORKBENCH_CONFIGS: FunctionalAgentWorkbenchConfig[] = _configs;

export function listWorkbenchConfigs(): FunctionalAgentWorkbenchConfig[] {
  return _configs;
}

export function getWorkbenchConfig(slug: string): FunctionalAgentWorkbenchConfig | undefined {
  return _bySlug.get(slug);
}

export function hasWorkbenchConfig(slug: string): boolean {
  return _bySlug.has(slug);
}

export function listWorkbenchConfigsByCategory(
  category: string,
): FunctionalAgentWorkbenchConfig[] {
  return _configs.filter((c) => c.category === category);
}

export function listWorkbenchConfigsByTemplateFamily(
  templateFamily: string,
): FunctionalAgentWorkbenchConfig[] {
  return _configs.filter((c) => c.templateFamily === templateFamily);
}

export function getWorkbenchAction(
  slug: string,
  actionId: string,
): WorkbenchActionConfig | undefined {
  const config = _bySlug.get(slug);
  if (!config) return undefined;
  return config.actions.find((a) => a.id === actionId);
}

export function listWorkbenchActions(slug: string): WorkbenchActionConfig[] {
  const config = _bySlug.get(slug);
  return config?.actions ?? [];
}

export function getRepresentativeWorkbenchAction(
  slug: string,
): WorkbenchActionConfig | undefined {
  const config = _bySlug.get(slug);
  return config?.actions[0];
}
