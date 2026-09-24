import { loadCanonicalModelRegistry, type CanonicalModelRegistry } from "./canonical-registry";
import { resolveCanonicalSlug } from "./aliases";
import { resolveCanonicalProviderId } from "./authority";
import type { MIModelProfile } from "./schemas";
import { evidenceFromProvenance, evaluateEvidence, type MIFactEvidence } from "./evidence";

export type MIModelLifecycle = "preview" | "experimental" | "stable" | "legacy" | "deprecated" | "retired" | "unknown";
export interface MIModelLineage { family: string | null; generation: string | null; variant: string | null; snapshot: string | null; predecessor: string | null; successor: string | null; replacement: string | null; baseModel: string | null; derivedFrom: string | null; }
export interface CanonicalProvider { id: string; displayName: string; aliases: string[]; modelCount: number; }
export interface CanonicalRegistryModel { profile: MIModelProfile; providerModelIds: string[]; lifecycle: MIModelLifecycle; lineage: MIModelLineage; license: string | null; openWeights: boolean | null; }
export type CanonicalModelReferenceResolution =
  | { status: "mapped"; canonicalModel: CanonicalRegistryModel }
  | { status: "unmapped"; modelId: string; providerId: string | null }
  | { status: "conflict"; modelId: string; providerId: string | null; reason: string };

let cachedRegistry: CanonicalRegistryModel[] | null = null;
function registry(): CanonicalRegistryModel[] {
  if (!cachedRegistry)
    cachedRegistry = loadCanonicalModelRegistry().records.map((profile) => ({
      profile,
      providerModelIds: [],
      lifecycle: "unknown",
      lineage: { family: null, generation: null, variant: null, snapshot: null, predecessor: null, successor: null, replacement: null, baseModel: null, derivedFrom: null },
      // MI-P0-04 (M6): openWeights/license are NOT projected from the raw
      // `open_source` tech spec here (that derivation lives in
      // console-model-library-loader). They stay null rather than being
      // guessed — the console surface and the canonical projection must not
      // invent a fact the canonical record does not carry.
      license: null,
      openWeights: null,
    }));
  return cachedRegistry;
}
export function listCanonicalModels(): CanonicalRegistryModel[] { return registry(); }
export function getCanonicalModel(idOrSlug: string): CanonicalRegistryModel | null { return registry().find((model) => model.profile.identity.id === idOrSlug || model.profile.identity.slug === idOrSlug) ?? null; }
export function resolveCanonicalModelAlias(alias: string): CanonicalRegistryModel | null { const slug = resolveCanonicalSlug(alias); return slug ? getCanonicalModel(slug) : null; }
export function listCanonicalProviders(): CanonicalProvider[] { const grouped = new Map<string, CanonicalRegistryModel[]>(); for (const model of registry()) { const id = model.profile.identity.providerId; grouped.set(id, [...(grouped.get(id) ?? []), model]); } return [...grouped].map(([id, models]) => ({ id, displayName: models[0]?.profile.identity.providerId ?? id, aliases: [], modelCount: models.length })).sort((a,b)=>a.id.localeCompare(b.id)); }
export function getCanonicalProvider(id: string): CanonicalProvider | null { const canonicalId = resolveCanonicalProviderId(id); return listCanonicalProviders().find((provider) => provider.id === canonicalId) ?? null; }
export function listModelsByProvider(providerId: string): CanonicalRegistryModel[] { const canonicalId = resolveCanonicalProviderId(providerId); return registry().filter((model) => model.profile.identity.providerId === canonicalId); }
export function getCanonicalCapabilities(idOrSlug: string) { return getCanonicalModel(idOrSlug)?.profile.capabilities ?? null; }
export function getModelLifecycle(idOrSlug: string): MIModelLifecycle | null { return getCanonicalModel(idOrSlug)?.lifecycle ?? null; }
export function getModelLineage(idOrSlug: string): MIModelLineage | null { return getCanonicalModel(idOrSlug)?.lineage ?? null; }
export function getProviderModelMapping(providerId: string, providerModelId: string): CanonicalRegistryModel | null { const provider = resolveCanonicalProviderId(providerId); return registry().find((model) => model.profile.identity.providerId === provider && model.providerModelIds.includes(providerModelId)) ?? null; }
export function getRegistryAccounting(): Pick<CanonicalModelRegistry, "sourceRecordCount" | "intentionalExclusions" | "unresolvedInvalidRecords"> { const value = loadCanonicalModelRegistry(); return { sourceRecordCount: value.sourceRecordCount, intentionalExclusions: value.intentionalExclusions, unresolvedInvalidRecords: value.unresolvedInvalidRecords }; }
export function getCanonicalModelEvidence(idOrSlug: string): { identity: MIFactEvidence<string>; contextWindow: MIFactEvidence<number>; pricing: MIFactEvidence<number>[] } | null {
  const model = getCanonicalModel(idOrSlug);
  if (!model) return null;
  const profile = model.profile;
  return {
    identity: evaluateEvidence(evidenceFromProvenance(profile.identity.name, profile.identity.provenance), "identity"),
    contextWindow: evaluateEvidence(evidenceFromProvenance(profile.context.maxTokens, profile.context.provenance), "context_limits"),
    pricing: profile.pricing.map((price) => evaluateEvidence(evidenceFromProvenance(price.priceUsd, price.provenance, "normalized_legacy", price.effectiveAt), "pricing")),
  };
}

/**
 * Resolve an external model reference only when MI has an exact canonical id,
 * slug, alias, or explicit provider-native id.  This intentionally does not
 * normalize version strings or infer a match from a model name.
 */
export function resolveCanonicalModelReference(
  modelId: string,
  providerId: string | null,
  models: CanonicalRegistryModel[] = registry(),
): CanonicalModelReferenceResolution {
  const trimmedModelId = modelId.trim();
  const plainModelId = trimmedModelId.split("/").at(-1) ?? trimmedModelId;
  const candidates = models.filter((model) => {
    const identity = model.profile.identity;
    return identity.id === trimmedModelId || identity.slug === trimmedModelId ||
      identity.slug === plainModelId || identity.aliases.includes(trimmedModelId) ||
      identity.aliases.includes(plainModelId) || model.providerModelIds.includes(trimmedModelId) ||
      model.providerModelIds.includes(plainModelId);
  });
  if (candidates.length === 0) return { status: "unmapped", modelId, providerId };
  if (candidates.length > 1) {
    return { status: "conflict", modelId, providerId, reason: `Ambiguous canonical model reference: ${candidates.map((model) => model.profile.identity.id).join(", ")}` };
  }
  const canonicalModel = candidates[0];
  const canonicalProviderId = providerId ? resolveCanonicalProviderId(providerId) : null;
  if (canonicalProviderId && canonicalModel.profile.identity.providerId !== canonicalProviderId) {
    return { status: "conflict", modelId, providerId, reason: `Provider mismatch: gateway/caller provided ${canonicalProviderId}, MI records ${canonicalModel.profile.identity.providerId}` };
  }
  return { status: "mapped", canonicalModel };
}
