/**
 * Patch-runtime port.
 *
 * The tool executor proposes and applies repository patches, but the patch
 * runtime itself is Code-product implementation and must not be pulled into a
 * shared package (it drags 32 further Code modules with it). The executor
 * declares the port here; the host that owns the Code runtime registers the
 * implementation at boot.
 *
 * Same inversion as the app-shell slots: the package declares the contract,
 * the host supplies the code, and the edge points host -> package.
 */

import type {
  PatchApplyInput,
  PatchApplyResult,
  PatchProposalInput,
  PatchProposalResult,
} from "@ethen/contracts/coding/runtime-types";

export interface PatchRuntime {
  proposePatch(
    input: PatchProposalInput,
    repoRoot: string,
  ): PatchProposalResult | { ok: false; error: string };
  applyPatch(input: PatchApplyInput, repoRoot: string): PatchApplyResult;
}

let runtime: PatchRuntime | null = null;

/** Register the host's patch runtime. Call once, before any tool executes. */
export function registerPatchRuntime(impl: PatchRuntime): void {
  runtime = impl;
}

function require_(): PatchRuntime {
  if (!runtime) {
    throw new Error(
      "No patch runtime registered. The host must call registerPatchRuntime() before a patch tool runs.",
    );
  }
  return runtime;
}

export function proposePatch(
  input: PatchProposalInput,
  repoRoot: string,
): PatchProposalResult | { ok: false; error: string } {
  return require_().proposePatch(input, repoRoot);
}

export function applyPatch(input: PatchApplyInput, repoRoot: string): PatchApplyResult {
  return require_().applyPatch(input, repoRoot);
}
