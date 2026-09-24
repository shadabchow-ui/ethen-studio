/**
 * PR-ST-03: Studio identity — durable creative profiles with identity references
 * and auditable lineage across assets.
 *
 * Profiles capture reusable creative identity (brand voice, visual style, character
 * references) and are linked to every generated asset so the lineage is auditable.
 * "A campaign retains consistent identity across assets" — identity references are
 * applied at generation time and recorded in the asset's provenance chain.
 */
import type { MediaAsset } from "./types";

// ── Identity Types ─────────────────────────────────────────────────────────

export type CreativeProfileStatus = "draft" | "active" | "archived";

export interface BrandVoice {
  tone: string[];
  vocabulary: string[];
  avoidedTerms: string[];
}

export interface VisualStyle {
  palette: string[];
  mood: string[];
  compositionNotes: string;
}

export interface CharacterReference {
  id: string;
  name: string;
  description: string;
  assetIds: string[];
  consentStatus: ConsentStatus;
  consentRecordedAt: string | null;
}

export type ConsentStatus =
  | "not_required"
  | "pending"
  | "granted"
  | "denied"
  | "revoked";

export interface CreativeProfile {
  id: string;
  projectId: string;
  title: string;
  status: CreativeProfileStatus;
  brandVoice: BrandVoice | null;
  visualStyle: VisualStyle | null;
  characterReferences: CharacterReference[];
  tagline: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityReference {
  profileId: string;
  assetId: string;
  appliedAt: string;
  /** Snapshot of the profile at time of application (immutable record). */
  profileSnapshot: CreativeProfile;
  appliedBy: string;
}

// ── Identity Store (in-memory for beta) ────────────────────────────────────

let profiles: CreativeProfile[] = [];
let identityReferences: IdentityReference[] = [];
let nextCounter = 0;

function generateId(prefix: string): string {
  nextCounter++;
  return `${prefix}_${Date.now()}_${nextCounter}`;
}

// ── Profile CRUD ───────────────────────────────────────────────────────────

export function createProfile(input: {
  projectId: string;
  title: string;
  brandVoice?: BrandVoice;
  visualStyle?: VisualStyle;
  characterReferences?: CharacterReference[];
  tagline?: string;
  description?: string;
}): CreativeProfile {
  const profile: CreativeProfile = {
    id: generateId("cp"),
    projectId: input.projectId,
    title: input.title,
    status: "draft",
    brandVoice: input.brandVoice ?? null,
    visualStyle: input.visualStyle ?? null,
    characterReferences: input.characterReferences ?? [],
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  profiles.push(profile);
  return { ...profile };
}

export function getProfile(id: string): CreativeProfile | null {
  const p = profiles.find((x) => x.id === id);
  return p ? { ...p } : null;
}

export function listProfiles(projectId: string): CreativeProfile[] {
  return profiles.filter((p) => p.projectId === projectId).map((p) => ({ ...p }));
}

export function updateProfile(
  id: string,
  updates: Partial<Omit<CreativeProfile, "id" | "projectId" | "createdAt">>,
): CreativeProfile | null {
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  profiles[idx] = {
    ...profiles[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  return { ...profiles[idx] };
}

export function archiveProfile(id: string): boolean {
  const p = profiles.find((x) => x.id === id);
  if (!p) return false;
  p.status = "archived";
  p.updatedAt = new Date().toISOString();
  return true;
}

// ── Identity Application ───────────────────────────────────────────────────

/**
 * Apply an identity profile to an asset, recording an immutable snapshot.
 * The profile snapshot is captured at application time so the identity reference
 * remains auditable even if the profile is later edited or deleted.
 */
export function applyIdentityToAsset(
  profileId: string,
  assetId: string,
  appliedBy: string,
): IdentityReference | null {
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return null;
  if (profile.status !== "active") return null;

  const ref: IdentityReference = {
    profileId,
    assetId,
    appliedAt: new Date().toISOString(),
    profileSnapshot: { ...profile },
    appliedBy,
  };
  identityReferences.push(ref);
  return { ...ref };
}

/**
 * Get the identity lineage for an asset — all profiles that were applied.
 */
export function getIdentityLineage(assetId: string): IdentityReference[] {
  return identityReferences
    .filter((r) => r.assetId === assetId)
    .map((r) => ({ ...r }));
}

/**
 * Get all assets that were generated using a given profile.
 */
export function getAssetsForProfile(profileId: string): string[] {
  return identityReferences
    .filter((r) => r.profileId === profileId)
    .map((r) => r.assetId);
}

// ── Consent Management ─────────────────────────────────────────────────────

export function recordConsent(
  characterId: string,
  status: ConsentStatus,
): boolean {
  for (const profile of profiles) {
    const char = profile.characterReferences.find((c) => c.id === characterId);
    if (char) {
      char.consentStatus = status;
      char.consentRecordedAt = new Date().toISOString();
      profile.updatedAt = new Date().toISOString();
      return true;
    }
  }
  return false;
}

export function getCharacterConsentStatus(characterId: string): ConsentStatus | null {
  for (const profile of profiles) {
    const char = profile.characterReferences.find((c) => c.id === characterId);
    if (char) return char.consentStatus;
  }
  return null;
}

// ── Reset (for testing) ────────────────────────────────────────────────────

export function resetIdentityStore(): void {
  profiles = [];
  identityReferences = [];
  nextCounter = 0;
}
