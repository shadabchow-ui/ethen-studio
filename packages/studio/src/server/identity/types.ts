/** Studio V5 identity — domain records, gates and ports (STUDIO_10). Server-only. */
import "server-only";
import type {
  IdentityBundle,
  IdentityKind,
  IdentityOrigin,
  VoiceBinding,
} from "../../contracts/identity";
import type { ProjectScope } from "../../contracts/scope";

export type { IdentityBundle, IdentityKind, IdentityOrigin, VoiceBinding, ProjectScope };

export const IDENTITY_KINDS: readonly IdentityKind[] = ["voice", "character", "product", "brand"];

export const IDENTITY_ORIGINS: readonly IdentityOrigin[] = ["stock", "designed", "cloned", "imported"];

/** Library tabs the selectors expose. Stock is global; the rest are project-scoped. */
export type IdentityLibraryTab = "my" | "stock" | "favorites" | "recent";

export const IDENTITY_LIBRARY_TABS: readonly IdentityLibraryTab[] = ["my", "stock", "favorites", "recent"];

/** Consent state as resolved from STUDIO_03 grants at use/delivery time. */
export type IdentityConsentStatus = "active" | "revoked" | "expired" | "needs_review" | "unknown";

export interface IdentityConsentSnapshot {
  identityId: string;
  status: IdentityConsentStatus;
  /** j03 verification_state; unknown blocks use even when status reads active. */
  verification: "user_declared" | "platform_verified" | "unknown";
  grantId: string | null;
  expiresAt: string | null;
}

export type IdentityUseOperation = "generate" | "preview" | "export" | "download" | "share" | "publish" | "clone" | "design";

export interface IdentityUseDecision {
  allowed: boolean;
  reason: string;
  /** Machine-readable code for UI remediation copy. */
  code:
    | "IDENTITY_OK"
    | "IDENTITY_CONSENT_UNKNOWN"
    | "IDENTITY_CONSENT_REVOKED"
    | "IDENTITY_CONSENT_EXPIRED"
    | "IDENTITY_CONSENT_REVIEW"
    | "IDENTITY_VERSION_REVOKED"
    | "IDENTITY_NOT_FOUND";
}

/** Stored identity head row (mutable head, immutable versions). */
export interface IdentityRecord {
  identityId: string;
  scope: ProjectScope | null;
  kind: IdentityKind;
  origin: IdentityOrigin;
  name: string;
  currentVersion: number;
  status: "active" | "quarantined";
  createdAt: string;
  updatedAt: string;
}

/** One immutable content version. Never updated or deleted, only appended. */
export interface IdentityVersionRecord {
  identityId: string;
  version: number;
  contentHash: string;
  payload: Readonly<Record<string, unknown>>;
  consentGrantId: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Provider attachment of one identity version. Separate from consent and base-model pins. */
export interface ProviderBindingRecord {
  bindingId: string;
  scope: ProjectScope | null;
  identityId: string;
  identityVersion: number;
  providerId: string;
  providerVoiceId: string;
  /**
   * Pinned endpoint, or null while the provider voice awaits endpoint
   * qualification. Pending bindings are listed explicitly, never usable.
   */
  endpointId: string | null;
  adapterVersion: string;
  compatibleModelIds: readonly string[];
  /** LoRA/base-model restriction refs; empty means no LoRA attachment. */
  loraRefs: readonly string[];
  revokedAt: string | null;
  createdAt: string;
}

/** LoRA artifact bound to a base model + identity version. No false portability. */
export interface IdentityLoraRecord {
  loraId: string;
  identityId: string;
  identityVersion: number;
  baseModelId: string;
  artifactRef: string;
  createdAt: string;
}

export interface IdentityFavoriteRecord {
  scope: ProjectScope;
  actorId: string;
  identityId: string;
  createdAt: string;
}

export interface IdentityRecentRecord {
  scope: ProjectScope;
  actorId: string;
  identityId: string;
  viewedAt: string;
}

export interface IdentityAliasRecord {
  alias: string;
  identityId: string;
  namespace: string;
}

export interface CompatibleModelCandidate {
  endpointId: string;
  familyId: string;
  label: string;
  executable: boolean;
  reasons: readonly string[];
}

export interface CompatibleModelQuery {
  scope: ProjectScope;
  identityId: string;
  identityVersion: number;
  task: string;
}

/** Minimal endpoint projection the compatible-model query consumes (j06 shape). */
export interface IdentityEndpointView {
  endpointId: string;
  familyId: string;
  providerId: string;
  task: string;
  label: string;
  identityBinding: boolean;
  executable: boolean;
  disabledReasons: readonly string[];
}

export type IdentityStoreErrorCode =
  | "IDENTITY_TENANT_MISMATCH"
  | "IDENTITY_NOT_FOUND"
  | "IDENTITY_IMMUTABLE_VERSION"
  | "IDENTITY_VERSION_CONFLICT"
  | "IDENTITY_BINDING_MISMATCH"
  | "IDENTITY_BINDING_REVOKED"
  | "IDENTITY_CONSENT_BLOCKED"
  | "IDENTITY_CAPABILITY_UNQUALIFIED"
  | "IDENTITY_EVIDENCE_REQUIRED"
  | "IDENTITY_VALIDATION";

export class IdentityStoreError extends Error {
  readonly code: IdentityStoreErrorCode;
  readonly detail: Readonly<Record<string, unknown>>;
  constructor(code: IdentityStoreErrorCode, message: string, detail: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "IdentityStoreError";
    this.code = code;
    this.detail = detail;
  }
}

/** Kernel port other domains consume (j11/j15/j16 resolve identities through this). */
export interface IdentityPort {
  getBundle(identityId: string, version: number | null): Promise<IdentityBundle | null>;
  checkUse(
    scope: ProjectScope,
    identityId: string,
    version: number,
    operation: IdentityUseOperation,
  ): Promise<IdentityUseDecision>;
  listBindings(identityId: string, version: number | null): Promise<readonly VoiceBinding[]>;
}
