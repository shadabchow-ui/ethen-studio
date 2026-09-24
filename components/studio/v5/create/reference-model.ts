/**
 * STUDIO_09 — reference binding model (pure).
 *
 * Recovers V2 preserve/change/target semantics: every reference names an
 * authorized project asset, a target it applies to, and whether the
 * output must preserve it or change it per the instruction. Arbitrary
 * remote URLs are rejected — references are authorized IDs only.
 */

import type { CreateReferenceBinding, ReferenceIntent } from "./types";

export interface ReferenceValidation {
  ok: boolean;
  problems: string[];
}

const MAX_REFERENCES = 4;

export function validateReferenceBinding(
  binding: CreateReferenceBinding,
  authorizedAssetIds: ReadonlySet<string>,
): ReferenceValidation {
  const problems: string[] = [];
  if (!binding.referenceAssetId.trim()) {
    problems.push("Reference must name a project asset.");
  } else if (!authorizedAssetIds.has(binding.referenceAssetId)) {
    problems.push("Reference asset is not in this project.");
  }
  if (/^https?:\/\//i.test(binding.referenceAssetId)) {
    problems.push("References must be project assets, not remote URLs.");
  }
  if (!binding.target.trim()) {
    problems.push("Reference must name a target (for example “subject” or “background”).");
  }
  if (binding.intent !== "preserve" && binding.intent !== "change") {
    problems.push("Reference intent must be “preserve” or “change”.");
  }
  if (binding.intent === "change" && !binding.instruction?.trim()) {
    problems.push("A “change” reference needs an instruction describing the change.");
  }
  return { ok: problems.length === 0, problems };
}

export function validateReferenceSet(
  bindings: readonly CreateReferenceBinding[],
  authorizedAssetIds: ReadonlySet<string>,
): ReferenceValidation {
  const problems: string[] = [];
  if (bindings.length > MAX_REFERENCES) {
    problems.push(`At most ${MAX_REFERENCES} references per request.`);
  }
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (seen.has(binding.referenceAssetId)) {
      problems.push("The same asset is referenced twice.");
    }
    seen.add(binding.referenceAssetId);
    const result = validateReferenceBinding(binding, authorizedAssetIds);
    problems.push(...result.problems);
  }
  return { ok: problems.length === 0, problems };
}

export function describeReference(binding: CreateReferenceBinding): string {
  const verb: Record<ReferenceIntent, string> = { preserve: "Preserve", change: "Change" };
  const base = `${verb[binding.intent]} ${binding.target} from ${binding.referenceKind.toLowerCase()}`;
  return binding.intent === "change" && binding.instruction?.trim()
    ? `${base}: ${binding.instruction.trim()}`
    : base;
}

/** Reference payload carried into job parameters (authorized ids only). */
export function referencesToParameters(bindings: readonly CreateReferenceBinding[]): ReadonlyArray<Record<string, unknown>> {
  return bindings.map((binding) => ({
    assetId: binding.referenceAssetId,
    kind: binding.referenceKind,
    intent: binding.intent,
    target: binding.target,
    ...(binding.instruction?.trim() ? { instruction: binding.instruction.trim() } : {}),
  }));
}
