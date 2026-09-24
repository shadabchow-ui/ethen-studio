/** Studio V5 identity — provider bindings + compatible-model query (STUDIO_10). Server-only. */
import "server-only";
import { randomUUID } from "node:crypto";
import type { VoiceBinding } from "../../contracts/identity";
import type { ProjectScope } from "../../contracts/scope";
import {
  IdentityStoreError,
  type CompatibleModelCandidate,
  type CompatibleModelQuery,
  type IdentityEndpointView,
  type ProviderBindingRecord,
} from "./types";

export interface CreateBindingInput {
  scope: ProjectScope | null;
  identityId: string;
  identityVersion: number;
  providerId: string;
  providerVoiceId: string;
  /** Null = provider voice known, no qualified endpoint bound yet. */
  endpointId: string | null;
  adapterVersion: string;
  compatibleModelIds?: readonly string[];
  loraRefs?: readonly string[];
  now?: string;
}

function cleanId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new IdentityStoreError("IDENTITY_VALIDATION", `${label} is required.`);
  return trimmed;
}

function cleanEndpoint(value: string | null): string | null {
  if (value === null) return null;
  return cleanId(value, "Endpoint id");
}

/**
 * Attach one identity version to one provider voice + endpoint. The
 * binding pins the exact endpoint; compatibleModelIds names additional
 * endpoints/models the same provider voice may serve — never a silent
 * cross-provider port.
 */
export function buildProviderBinding(input: CreateBindingInput): ProviderBindingRecord {
  if (!Number.isInteger(input.identityVersion) || input.identityVersion < 1) {
    throw new IdentityStoreError("IDENTITY_VALIDATION", "Binding identity version must be a positive integer.");
  }
  return {
    bindingId: randomUUID(),
    scope: input.scope,
    identityId: cleanId(input.identityId, "Identity id"),
    identityVersion: input.identityVersion,
    providerId: cleanId(input.providerId, "Provider id"),
    providerVoiceId: cleanId(input.providerVoiceId, "Provider voice id"),
    endpointId: cleanEndpoint(input.endpointId),
    adapterVersion: cleanId(input.adapterVersion, "Adapter version"),
    compatibleModelIds: [...(input.compatibleModelIds ?? [])],
    loraRefs: [...(input.loraRefs ?? [])],
    revokedAt: null,
    createdAt: input.now ?? new Date().toISOString(),
  };
}

export function bindingCoversEndpoint(binding: ProviderBindingRecord, endpoint: IdentityEndpointView): boolean {
  if (binding.revokedAt !== null) return false;
  if (binding.endpointId === null) return false;
  return (
    binding.endpointId === endpoint.endpointId ||
    binding.compatibleModelIds.includes(endpoint.endpointId) ||
    binding.compatibleModelIds.includes(endpoint.familyId)
  );
}

/** Mirror of the j06 eligibility rule: endpoint must opt into identity bindings and be covered. */
export function bindingMismatchReason(
  binding: ProviderBindingRecord,
  endpoint: IdentityEndpointView,
): string | null {
  if (binding.revokedAt !== null) {
    return `Binding ${binding.bindingId} was revoked at ${binding.revokedAt}; select another voice or re-create the binding.`;
  }
  if (binding.endpointId === null) {
    return (
      `Binding ${binding.bindingId} holds provider voice ${binding.providerVoiceId} (${binding.providerId}) ` +
      `but no qualified endpoint is bound yet; it cannot be used until qualification binds one.`
    );
  }
  if (!endpoint.identityBinding) {
    return `Endpoint ${endpoint.endpointId} does not support identity bindings.`;
  }
  if (!bindingCoversEndpoint(binding, endpoint)) {
    return (
      `Voice binding ${binding.bindingId} pins ${binding.endpointId} and is not compatible with ` +
      `${endpoint.endpointId}; compatible models: ${binding.compatibleModelIds.join(", ") || "none listed"}.`
    );
  }
  return null;
}

export function assertBindingCovers(binding: ProviderBindingRecord, endpoint: IdentityEndpointView): void {
  const reason = bindingMismatchReason(binding, endpoint);
  if (reason) {
    throw new IdentityStoreError("IDENTITY_BINDING_MISMATCH", reason, {
      bindingId: binding.bindingId,
      endpointId: endpoint.endpointId,
    });
  }
}

export interface CompatibleModelInputs {
  query: CompatibleModelQuery;
  bindings: readonly ProviderBindingRecord[];
  endpoints: readonly IdentityEndpointView[];
}

/**
 * Compatible-model query: for one identity version + task, explain every
 * endpoint as compatible or excluded with reasons. Voice and model stay
 * independently selectable — this query explains, never re-pins.
 */
export function queryCompatibleModels(inputs: CompatibleModelInputs): {
  candidates: CompatibleModelCandidate[];
  bindings: readonly VoiceBinding[];
} {
  const { query, bindings, endpoints } = inputs;
  const versioned = bindings.filter(
    (b) => b.identityId === query.identityId && b.identityVersion === query.identityVersion,
  );
  const candidates: CompatibleModelCandidate[] = endpoints
    .filter((endpoint) => endpoint.task === query.task)
    .map((endpoint) => {
      const reasons: string[] = [];
      let covered = false;
      for (const binding of versioned) {
        const mismatch = bindingMismatchReason(binding, endpoint);
        if (mismatch === null) {
          covered = true;
          reasons.push(`Covered by binding ${binding.bindingId} (${binding.providerId}).`);
        } else if (versioned.length === 1) {
          reasons.push(mismatch);
        }
      }
      if (versioned.length === 0) {
        reasons.push(`No provider binding exists for identity ${query.identityId} version ${query.identityVersion}.`);
      } else if (!covered && versioned.length > 1) {
        reasons.push(`None of the ${versioned.length} bindings for this identity version cover ${endpoint.endpointId}.`);
      }
      if (!endpoint.executable) {
        reasons.push(...endpoint.disabledReasons);
      }
      return {
        endpointId: endpoint.endpointId,
        familyId: endpoint.familyId,
        label: endpoint.label,
        executable: covered && endpoint.executable,
        reasons,
      };
    });
  return {
    candidates,
    // Only endpoint-bound rows project to the kernel VoiceBinding; pending
    // rows stay visible through the candidates' reasons, never as usable.
    bindings: versioned
      .filter((b) => b.endpointId !== null)
      .map(
        (b): VoiceBinding => ({
          bindingId: b.bindingId,
          identityId: b.identityId,
          identityVersion: b.identityVersion,
          endpointId: b.endpointId as string,
          adapterVersion: b.adapterVersion,
          compatibleModelIds: [...b.compatibleModelIds],
          revokedAt: b.revokedAt,
        }),
      ),
  };
}
