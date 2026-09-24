// Functional Agent Spec Registry — Aggregates all Wave 1 + Wave 3 functional agent specs
// Provides unified lookup across Batch A, Batch B, and Wave 3 security/finance/compliance implementations.

import type { FunctionalAgentSpec } from "./types";
import { WAVE1_FUNCTIONAL_SPECS, TECHNICAL_ENTERPRISE_SPECS, ALL_FUNCTIONAL_SPECS } from "./functional-specs";
import { WAVE3_FUNCTIONAL_SPECS } from "./wave3-functional-specs";

const specMap = new Map<string, FunctionalAgentSpec>();
WAVE1_FUNCTIONAL_SPECS.forEach((spec) => specMap.set(spec.slug, spec));
TECHNICAL_ENTERPRISE_SPECS.forEach((spec) => specMap.set(spec.slug, spec));
WAVE3_FUNCTIONAL_SPECS.forEach((spec) => specMap.set(spec.slug, spec));

export function listFunctionalAgentSpecs(): FunctionalAgentSpec[] {
  return [...ALL_FUNCTIONAL_SPECS, ...WAVE3_FUNCTIONAL_SPECS];
}

export function hasFunctionalAgentSpec(slug: string): boolean {
  return specMap.has(slug);
}

export function getFunctionalAgentSpec(slug: string): FunctionalAgentSpec | null {
  return specMap.get(slug) ?? null;
}

export function getFunctionalAgentSpecsByCategory(category: string): FunctionalAgentSpec[] {
  return [...ALL_FUNCTIONAL_SPECS, ...WAVE3_FUNCTIONAL_SPECS].filter((s) => s.category === category);
}

export function registerFunctionalAgentSpec(spec: FunctionalAgentSpec): boolean {
  if (specMap.has(spec.slug)) return false;
  specMap.set(spec.slug, spec);
  return true;
}
