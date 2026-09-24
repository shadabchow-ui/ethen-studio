/** Studio V5 gateway — tenant BYOK vault references (STUDIO_19). Server-only. */
import "server-only";
import { randomBytes } from "node:crypto";
import { gatewayError, type ByokMetadata, type ByokReference } from "./types";

const SUPPORTED_PROVIDERS = ["fal", "openai", "elevenlabs", "custom"] as const;

export function isSupportedByokProvider(provider: string): boolean {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}

export interface RegisterByokInput {
  tenantId: string;
  provider: string;
  /** Vault-side key identifier (opaque pointer, never secret material). */
  vaultKeyId: string;
  label: string;
  createdBy: string;
  nowIso?: string;
}

/**
 * Register a BYOK vault reference. Only the opaque vault pointer is
 * stored; plaintext credentials are never accepted, persisted, logged,
 * or returned by any gateway function.
 */
export function registerByokReference(input: RegisterByokInput): ByokReference {
  if (!input.tenantId.trim()) throw gatewayError("BAD_REQUEST", "tenantId is required.");
  if (!isSupportedByokProvider(input.provider)) {
    throw gatewayError("BAD_REQUEST", `BYOK provider is not supported: ${input.provider}.`);
  }
  if (!input.vaultKeyId.trim() || input.vaultKeyId.length > 256) {
    throw gatewayError("BAD_REQUEST", "vaultKeyId must be a non-empty vault pointer.");
  }
  if (!input.label.trim()) throw gatewayError("BAD_REQUEST", "BYOK label is required.");
  if (!input.createdBy.trim()) throw gatewayError("BAD_REQUEST", "createdBy is required.");
  return {
    referenceId: `byok_${randomBytes(9).toString("hex")}`,
    tenantId: input.tenantId,
    provider: input.provider,
    vaultKeyId: input.vaultKeyId.trim(),
    label: input.label.trim(),
    createdBy: input.createdBy,
    createdAt: input.nowIso ?? new Date().toISOString(),
  };
}

export function byokMetadata(reference: ByokReference): ByokMetadata {
  return {
    referenceId: reference.referenceId,
    provider: reference.provider,
    label: reference.label,
    createdAt: reference.createdAt,
  };
}

export interface ByokResolution {
  referenceId: string;
  provider: string;
  /** Opaque handle for the worker-side vault fetch. Not the credential. */
  vaultHandle: string;
}

/**
 * Resolve a reference for worker-side credential fetch. Tenant-isolated:
 * a reference registered by tenant A never resolves for tenant B.
 * Returns an opaque handle, never secret material.
 */
export function resolveByokForTenant(
  reference: ByokReference,
  tenantId: string,
): ByokResolution {
  if (reference.tenantId !== tenantId) {
    throw gatewayError("FORBIDDEN", "BYOK reference is not visible to this tenant.");
  }
  return {
    referenceId: reference.referenceId,
    provider: reference.provider,
    vaultHandle: `vault://${reference.provider}/${reference.vaultKeyId}`,
  };
}
