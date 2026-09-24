/**
 * STUDIO_10 — identity API envelope parsing.
 *
 * Browser-safe. Every parser maps the V1 envelope into ready/empty/
 * setup/permission/error states; a fetch failure is never empty
 * success, and malformed rows are skipped, never crashing.
 */
import type { StudioDataState } from "../shell/types";
import type {
  CompatibleModelView,
  IdentityConsentView,
  IdentityKind,
  IdentityListItem,
  IdentityOrigin,
  IdentityVersionView,
  VoiceBindingView,
} from "./types";

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

const KINDS: readonly string[] = ["voice", "character", "product", "brand"];
const ORIGINS: readonly string[] = ["stock", "designed", "cloned", "imported"];
const CONSENTS: readonly string[] = ["active", "revoked", "expired", "needs_review", "unknown", "none"];

/** Map a V1 error code to a distinct consumer state. */
export function identityStateForErrorCode(code: string | null): StudioDataState {
  if (code === "SETUP_REQUIRED") return "setup";
  if (code === "UNAUTHORIZED" || code === "FORBIDDEN") return "permission";
  return "error";
}

function errorCodeOf(envelope: unknown): string | null {
  const root = asRecord(envelope);
  const error = root ? asRecord(root.error) : null;
  const code = error ? asRecord(error)?.code : null;
  return typeof code === "string" ? code : null;
}

function parseIdentityItem(value: unknown): IdentityListItem | null {
  const row = asRecord(value);
  if (!row) return null;
  const identityId = asString(row.identityId);
  const kind = asString(row.kind);
  const origin = asString(row.origin);
  if (!identityId || !KINDS.includes(kind) || !ORIGINS.includes(origin)) return null;
  const consentRaw = asRecord(row.consent);
  const consentStatus = consentRaw ? asString(consentRaw.status, "none") : "none";
  return {
    identityId,
    kind: kind as IdentityKind,
    origin: origin as IdentityOrigin,
    name: asString(row.name, "Untitled"),
    currentVersion: asNumber(row.currentVersion, 1),
    status: asString(row.status) === "quarantined" ? "quarantined" : "active",
    stock: row.stock === true,
    favorite: row.favorite === true,
    consent: (CONSENTS.includes(consentStatus) ? consentStatus : "none") as IdentityConsentView,
    createdAt: asString(row.createdAt),
    updatedAt: asString(row.updatedAt),
  };
}

export interface ParsedIdentityList {
  state: StudioDataState | "ready";
  identities: IdentityListItem[];
  missingFavoriteIds: string[];
}

export function parseIdentitiesResponse(envelope: unknown): ParsedIdentityList {
  const root = asRecord(envelope);
  if (!root || root.ok !== true) {
    return { state: identityStateForErrorCode(errorCodeOf(envelope)), identities: [], missingFavoriteIds: [] };
  }
  const data = asRecord(root.data);
  const list = data && Array.isArray(data.identities) ? data.identities : null;
  if (!list) return { state: "error", identities: [], missingFavoriteIds: [] };
  const identities = list
    .map(parseIdentityItem)
    .filter((item): item is IdentityListItem => item !== null);
  const missingFavoriteIds = data ? asStringArray(data.missingFavoriteIds).slice() : [];
  return { state: identities.length === 0 ? "empty" : "ready", identities, missingFavoriteIds };
}

export function parseIdentityVersionsResponse(envelope: unknown): {
  state: StudioDataState | "ready";
  versions: IdentityVersionView[];
  currentVersion: number;
} {
  const root = asRecord(envelope);
  if (!root || root.ok !== true) {
    return { state: identityStateForErrorCode(errorCodeOf(envelope)), versions: [], currentVersion: 1 };
  }
  const data = asRecord(root.data);
  const list = data && Array.isArray(data.versions) ? data.versions : null;
  if (!list) return { state: "error", versions: [], currentVersion: 1 };
  const identity = data ? asRecord(data.identity) : null;
  const versions: IdentityVersionView[] = [];
  for (const entry of list) {
    const row = asRecord(entry);
    if (!row) continue;
    const version = asNumber(row.version, 0);
    if (!Number.isInteger(version) || version < 1) continue;
    versions.push({
      version,
      contentHash: asString(row.contentHash),
      consentGrantId: typeof row.consentGrantId === "string" ? row.consentGrantId : null,
      revokedAt: typeof row.revokedAt === "string" ? row.revokedAt : null,
      createdAt: asString(row.createdAt),
    });
  }
  versions.sort((a, b) => b.version - a.version);
  return {
    state: versions.length === 0 ? "empty" : "ready",
    versions,
    currentVersion: identity ? asNumber(identity.currentVersion, versions[0]?.version ?? 1) : 1,
  };
}

export function parseVoiceBindingsResponse(envelope: unknown): {
  state: StudioDataState | "ready";
  bindings: VoiceBindingView[];
} {
  const root = asRecord(envelope);
  if (!root || root.ok !== true) {
    return { state: identityStateForErrorCode(errorCodeOf(envelope)), bindings: [] };
  }
  const data = asRecord(root.data);
  const list = data && Array.isArray(data.bindings) ? data.bindings : null;
  if (!list) return { state: "error", bindings: [] };
  const bindings: VoiceBindingView[] = [];
  for (const entry of list) {
    const row = asRecord(entry);
    if (!row) continue;
    const bindingId = asString(row.bindingId);
    if (!bindingId) continue;
    const state = asString(row.state);
    bindings.push({
      bindingId,
      identityVersion: asNumber(row.identityVersion, 1),
      providerId: asString(row.providerId),
      providerVoiceId: asString(row.providerVoiceId),
      endpointId: typeof row.endpointId === "string" ? row.endpointId : null,
      adapterVersion: asString(row.adapterVersion),
      compatibleModelIds: asStringArray(row.compatibleModelIds),
      loraRefs: asStringArray(row.loraRefs),
      state: state === "bound" || state === "pending" || state === "revoked" ? state : "pending",
      createdAt: asString(row.createdAt),
    });
  }
  return { state: bindings.length === 0 ? "empty" : "ready", bindings };
}

export function parseCompatibleResponse(envelope: unknown): {
  state: StudioDataState | "ready";
  candidates: CompatibleModelView[];
} {
  const root = asRecord(envelope);
  if (!root || root.ok !== true) {
    return { state: identityStateForErrorCode(errorCodeOf(envelope)), candidates: [] };
  }
  const data = asRecord(root.data);
  const list = data && Array.isArray(data.candidates) ? data.candidates : null;
  if (!list) return { state: "error", candidates: [] };
  const candidates: CompatibleModelView[] = [];
  for (const entry of list) {
    const row = asRecord(entry);
    if (!row) continue;
    const endpointId = asString(row.endpointId);
    if (!endpointId) continue;
    candidates.push({
      endpointId,
      familyId: asString(row.familyId),
      label: asString(row.label, endpointId),
      executable: row.executable === true,
      reasons: asStringArray(row.reasons),
    });
  }
  return { state: candidates.length === 0 ? "empty" : "ready", candidates };
}

/** Human-readable consent badge copy; unknown/none explain the block. */
export function consentBadgeFor(consent: IdentityConsentView): { label: string; blocked: boolean } {
  switch (consent) {
    case "active":
      return { label: "Consent on file", blocked: false };
    case "revoked":
      return { label: "Consent revoked", blocked: true };
    case "expired":
      return { label: "Consent expired", blocked: true };
    case "needs_review":
      return { label: "Consent needs review", blocked: true };
    case "unknown":
      return { label: "Consent unverified", blocked: true };
    case "none":
    default:
      return { label: "No consent on file", blocked: true };
  }
}
