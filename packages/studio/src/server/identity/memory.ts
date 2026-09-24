/** Studio V5 identity — memory store + kernel port adapter (STUDIO_10). Server-only. */
import "server-only";
import type { IdentityBundle, VoiceBinding } from "../../contracts/identity";
import type { ProjectScope } from "../../contracts/scope";
import { serializeScope } from "../../contracts/scope";
import { buildProviderBinding, type CreateBindingInput } from "./bindings";
import { checkIdentityUse } from "./consent-gate";
import {
  type IdentityAliasRecord,
  type IdentityConsentSnapshot,
  type IdentityFavoriteRecord,
  IdentityStoreError,
  type IdentityPort,
  type IdentityRecentRecord,
  type IdentityRecord,
  type IdentityUseDecision,
  type IdentityUseOperation,
  type IdentityVersionRecord,
  type ProviderBindingRecord,
} from "./types";
import { buildIdentityWithVersion1, buildNextIdentityVersion, toBundle, type CreateIdentityInput } from "./versions";

function scopeKey(scope: ProjectScope | null): string | null {
  return scope ? serializeScope(scope) : null;
}

function sameScope(a: ProjectScope | null, b: ProjectScope | null): boolean {
  return scopeKey(a) === scopeKey(b);
}

/** Test/local store. Production binds Supabase-backed adapters instead. */
export class MemoryIdentityRepository {
  private readonly identities = new Map<string, IdentityRecord>();
  private readonly versions = new Map<string, IdentityVersionRecord[]>();
  private readonly bindings = new Map<string, ProviderBindingRecord>();
  private readonly consents = new Map<string, IdentityConsentSnapshot>();
  private readonly favorites: IdentityFavoriteRecord[] = [];
  private readonly recents: IdentityRecentRecord[] = [];
  private readonly aliases: IdentityAliasRecord[] = [];

  createIdentity(input: CreateIdentityInput): { record: IdentityRecord; version: IdentityVersionRecord } {
    const built = buildIdentityWithVersion1(input);
    this.identities.set(built.record.identityId, built.record);
    this.versions.set(built.record.identityId, [built.version]);
    return { record: built.record, version: built.version };
  }

  /** Scoped get: cross-tenant reads return null, never leak. Stock (null scope) is globally readable. */
  getIdentity(scope: ProjectScope, identityId: string): IdentityRecord | null {
    const record = this.identities.get(identityId) ?? null;
    if (!record) return null;
    if (record.scope !== null && !sameScope(record.scope, scope)) return null;
    return record;
  }

  listIdentities(scope: ProjectScope): IdentityRecord[] {
    return [...this.identities.values()].filter((record) => record.scope === null || sameScope(record.scope, scope));
  }

  getVersion(scope: ProjectScope, identityId: string, version: number): IdentityVersionRecord | null {
    const record = this.getIdentity(scope, identityId);
    if (!record) return null;
    return (this.versions.get(identityId) ?? []).find((row) => row.version === version) ?? null;
  }

  listVersions(scope: ProjectScope, identityId: string): IdentityVersionRecord[] {
    if (!this.getIdentity(scope, identityId)) return [];
    return [...(this.versions.get(identityId) ?? [])];
  }

  appendVersion(input: {
    scope: ProjectScope;
    identityId: string;
    payload: Readonly<Record<string, unknown>>;
    consentGrantId?: string | null;
    now?: string;
  }): { record: IdentityRecord; version: IdentityVersionRecord } {
    const record = this.getIdentity(input.scope, input.identityId);
    if (!record) throw new IdentityStoreError("IDENTITY_NOT_FOUND", `Identity ${input.identityId} was not found.`);
    if (record.scope !== null && !sameScope(record.scope, input.scope)) {
      throw new IdentityStoreError("IDENTITY_TENANT_MISMATCH", "Cross-tenant identity mutation is denied.");
    }
    if (record.scope === null) {
      throw new IdentityStoreError("IDENTITY_VALIDATION", "Stock identities are curated; versions cannot be appended by tenants.");
    }
    const rows = this.versions.get(input.identityId) ?? [];
    const built = buildNextIdentityVersion({
      record,
      latestVersion: rows.length === 0 ? record.currentVersion : Math.max(...rows.map((row) => row.version)),
      payload: input.payload,
      consentGrantId: input.consentGrantId,
      now: input.now,
    });
    rows.push(built.version);
    this.versions.set(input.identityId, rows);
    this.identities.set(input.identityId, built.record);
    return { record: built.record, version: built.version };
  }

  /** Any version rewrite attempt throws IDENTITY_IMMUTABLE_VERSION. */
  rewriteVersion(): never {
    throw new IdentityStoreError(
      "IDENTITY_IMMUTABLE_VERSION",
      "Stored identity versions are append-only and cannot be rewritten.",
    );
  }

  revokeVersion(scope: ProjectScope, identityId: string, version: number, now?: string): IdentityVersionRecord {
    const row = this.getVersion(scope, identityId, version);
    if (!row) throw new IdentityStoreError("IDENTITY_NOT_FOUND", `Identity ${identityId} version ${version} was not found.`);
    const revoked: IdentityVersionRecord = { ...row, revokedAt: now ?? new Date().toISOString() };
    const rows = (this.versions.get(identityId) ?? []).map((entry) => (entry.version === version ? revoked : entry));
    this.versions.set(identityId, rows);
    return revoked;
  }

  createBinding(input: CreateBindingInput & { scope: ProjectScope | null }): ProviderBindingRecord {
    const owner = input.scope ? this.getIdentity(input.scope, input.identityId) : (this.identities.get(input.identityId) ?? null);
    if (!owner) throw new IdentityStoreError("IDENTITY_NOT_FOUND", `Identity ${input.identityId} was not found.`);
    const binding = buildProviderBinding(input);
    this.bindings.set(binding.bindingId, binding);
    return binding;
  }

  listBindings(identityId: string, version: number | null): ProviderBindingRecord[] {
    return [...this.bindings.values()].filter(
      (binding) => binding.identityId === identityId && (version === null || binding.identityVersion === version),
    );
  }

  revokeBinding(bindingId: string, now?: string): ProviderBindingRecord {
    const binding = this.bindings.get(bindingId);
    if (!binding) throw new IdentityStoreError("IDENTITY_NOT_FOUND", `Binding ${bindingId} was not found.`);
    const revoked: ProviderBindingRecord = { ...binding, revokedAt: now ?? new Date().toISOString() };
    this.bindings.set(bindingId, revoked);
    return revoked;
  }

  putConsent(snapshot: IdentityConsentSnapshot): void {
    this.consents.set(snapshot.identityId, snapshot);
  }

  getConsent(identityId: string): IdentityConsentSnapshot | null {
    return this.consents.get(identityId) ?? null;
  }

  checkUse(scope: ProjectScope, identityId: string, version: number, operation: IdentityUseOperation, now?: string): IdentityUseDecision {
    return checkIdentityUse({
      identityId,
      version: this.getVersion(scope, identityId, version),
      consent: this.getConsent(identityId),
      operation,
      now,
    });
  }

  addFavorite(input: { scope: ProjectScope; actorId: string; identityId: string; now?: string }): IdentityFavoriteRecord {
    const record = this.getIdentity(input.scope, input.identityId);
    if (!record) throw new IdentityStoreError("IDENTITY_NOT_FOUND", `Identity ${input.identityId} was not found.`);
    const existing = this.favorites.find(
      (row) => sameScope(row.scope, input.scope) && row.actorId === input.actorId && row.identityId === input.identityId,
    );
    if (existing) return existing;
    const row: IdentityFavoriteRecord = {
      scope: input.scope,
      actorId: input.actorId,
      identityId: input.identityId,
      createdAt: input.now ?? new Date().toISOString(),
    };
    this.favorites.push(row);
    return row;
  }

  removeFavorite(scope: ProjectScope, actorId: string, identityId: string): boolean {
    const before = this.favorites.length;
    const kept = this.favorites.filter(
      (row) => !(sameScope(row.scope, scope) && row.actorId === actorId && row.identityId === identityId),
    );
    this.favorites.length = 0;
    this.favorites.push(...kept);
    return kept.length !== before;
  }

  listFavorites(scope: ProjectScope, actorId: string): IdentityFavoriteRecord[] {
    return this.favorites.filter((row) => sameScope(row.scope, scope) && row.actorId === actorId);
  }

  recordRecent(input: { scope: ProjectScope; actorId: string; identityId: string; now?: string }): void {
    const at = input.now ?? new Date().toISOString();
    const kept = this.recents.filter(
      (row) => !(sameScope(row.scope, input.scope) && row.actorId === input.actorId && row.identityId === input.identityId),
    );
    this.recents.length = 0;
    this.recents.push(...kept, { scope: input.scope, actorId: input.actorId, identityId: input.identityId, viewedAt: at });
  }

  listRecents(scope: ProjectScope, actorId: string): IdentityRecentRecord[] {
    return this.recents
      .filter((row) => sameScope(row.scope, scope) && row.actorId === actorId)
      .slice()
      .sort((a, b) => (a.viewedAt < b.viewedAt ? 1 : -1));
  }

  addAlias(alias: IdentityAliasRecord): void {
    if (!this.aliases.some((entry) => entry.alias === alias.alias)) this.aliases.push(alias);
  }

  listAliases(): IdentityAliasRecord[] {
    return [...this.aliases];
  }
}

export interface MemoryIdentityStore {
  identities: MemoryIdentityRepository;
}

export function createMemoryIdentityStore(): MemoryIdentityStore {
  return { identities: new MemoryIdentityRepository() };
}

/** Adapt the memory store to the minimal kernel IdentityPort. */
export function adaptIdentityPort(store: MemoryIdentityStore, scope: ProjectScope): IdentityPort {
  return {
    getBundle: async (identityId: string, version: number | null): Promise<IdentityBundle | null> => {
      const record = store.identities.getIdentity(scope, identityId);
      if (!record || !record.scope) return null;
      const rows = store.identities.listVersions(scope, identityId);
      const row = version === null ? rows[rows.length - 1] : rows.find((entry) => entry.version === version);
      if (!row) return null;
      return toBundle(record, row);
    },
    checkUse: async (
      _scope: ProjectScope,
      identityId: string,
      version: number,
      operation: IdentityUseOperation,
    ): Promise<IdentityUseDecision> => store.identities.checkUse(scope, identityId, version, operation),
    listBindings: async (identityId: string, version: number | null): Promise<readonly VoiceBinding[]> =>
      store.identities
        .listBindings(identityId, version)
        .filter((binding) => binding.endpointId !== null)
        .map(
          (binding): VoiceBinding => ({
            bindingId: binding.bindingId,
            identityId: binding.identityId,
            identityVersion: binding.identityVersion,
            endpointId: binding.endpointId as string,
            adapterVersion: binding.adapterVersion,
            compatibleModelIds: [...binding.compatibleModelIds],
            revokedAt: binding.revokedAt,
          }),
        ),
  };
}
