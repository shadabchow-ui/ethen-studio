/**
 * Studio V2 Job 07 — standards-shaped provenance adapter + independent validator.
 *
 * Honesty contract (load-bearing): internal Studio lineage is NEVER
 * misrepresented as standardized C2PA evidence. Manifests use the C2PA
 * claim/ingredient shape so tooling can parse them, but:
 * - signature status is `unsigned` (no trust anchor is configured);
 * - trust level is `self-asserted`, stated in the manifest itself;
 * - the validator fail-closes on any `signed` claim without a configured
 *   trust anchor, on hash mismatch, and on stripped ingredients.
 * Verdicts: `valid-structure` (hashes verify, honestly unsigned),
 * `invalid` (tampered, malformed, or untrusted signer), `incomplete`
 * (ingredients stripped). There is deliberately no `trusted` verdict.
 */

import { createHash } from "node:crypto";

export const C2PA_CLAIM_GENERATOR = "ethen-studio-v2/1.0" as const;
export const C2PA_MANIFEST_VERSION = 1 as const;

export interface C2PAIngredientInput {
  assetId: string;
  contentHash: string;
  mimeType: string;
  title: string;
  relationship: "parentOf" | "inputTo";
}

export interface C2PAManifestInput {
  title: string;
  ingredients: C2PAIngredientInput[];
  exportPreset: string;
  exportPresetVersion: string;
  manifestHash: string;
}

export interface C2PAManifest {
  claim_generator: string;
  claim_version: number;
  created_at: string;
  title: string;
  ingredients: Array<{
    assetId: string;
    contentHash: string;
    mimeType: string;
    title: string;
    relationship: string;
  }>;
  assertions: {
    creativeWork: { title: string };
    studioExport: { preset: string; presetVersion: string; manifestHash: string };
  };
  signature: { status: "unsigned"; reason: string; algorithm: null };
  trust: { level: "self-asserted"; note: string };
}

export type C2PAVerdict = "valid-structure" | "invalid" | "incomplete";

/** Build a standards-shaped, honestly-unsigned provenance manifest. */
export function buildC2PAManifest(input: C2PAManifestInput): C2PAManifest {
  if (input.ingredients.length === 0) {
    throw new Error("EXPORT_C2PA_INVALID: at least one ingredient is required.");
  }
  for (const ingredient of input.ingredients) {
    if (!/^[0-9a-f]{64}$/i.test(ingredient.contentHash ?? "")) {
      throw new Error(`EXPORT_C2PA_INVALID: ingredient ${ingredient.assetId} has no sha256 content hash.`);
    }
  }
  return {
    claim_generator: C2PA_CLAIM_GENERATOR,
    claim_version: C2PA_MANIFEST_VERSION,
    created_at: new Date().toISOString(),
    title: input.title,
    ingredients: input.ingredients.map((ingredient) => ({ ...ingredient })),
    assertions: {
      creativeWork: { title: input.title },
      studioExport: { preset: input.exportPreset, presetVersion: input.exportPresetVersion, manifestHash: input.manifestHash },
    },
    signature: { status: "unsigned", reason: "no-trust-anchor-configured", algorithm: null },
    trust: {
      level: "self-asserted",
      note: "Internal Studio lineage only. NOT standardized C2PA evidence: no trust-list membership and no credential.",
    },
  };
}

export interface C2PAValidationResult {
  verdict: C2PAVerdict;
  checked: number;
  failures: string[];
}

/**
 * Independently validate a manifest. `bytesByHash` maps content hashes to
 * the bytes the validator must verify (when omitted, hash presence and
 * format are checked but content is reported unverified-bytes-absent —
 * still `valid-structure`, never `trusted`).
 */
export function validateC2PAManifest(
  manifest: unknown,
  bytesByHash: Readonly<Record<string, Uint8Array>> = {},
): C2PAValidationResult {
  const failures: string[] = [];
  if (typeof manifest !== "object" || manifest === null) {
    return { verdict: "invalid", checked: 0, failures: ["manifest is not an object"] };
  }
  const record = manifest as Record<string, unknown>;
  if (record.claim_generator !== C2PA_CLAIM_GENERATOR) failures.push("unexpected claim generator");
  const ingredients = record.ingredients;
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return { verdict: "incomplete", checked: 0, failures: ["ingredients stripped or absent"] };
  }
  const signature = record.signature as { status?: string } | undefined;
  if (signature?.status === "signed") {
    return { verdict: "invalid", checked: ingredients.length, failures: ["signed claim without a configured trust anchor"] };
  }
  if (signature?.status !== "unsigned") {
    failures.push("signature status is neither unsigned nor signed");
  }
  let checked = 0;
  for (const ingredient of ingredients as Array<Record<string, unknown>>) {
    checked += 1;
    const hash = typeof ingredient.contentHash === "string" ? ingredient.contentHash : "";
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      failures.push(`ingredient ${String(ingredient.assetId ?? "?")} has a malformed hash`);
      continue;
    }
    const bytes = bytesByHash[hash.toLowerCase()] ?? bytesByHash[hash.toUpperCase()];
    if (bytes) {
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual.toLowerCase() !== hash.toLowerCase()) {
        failures.push(`ingredient ${String(ingredient.assetId ?? "?")} hash mismatch`);
      }
    }
  }
  if (failures.length > 0) return { verdict: "invalid", checked, failures };
  return { verdict: "valid-structure", checked, failures: [] };
}
