// ── Creative Memory Profiles ────────────────────────────────────────────────
// Typed foundations for reusable creative memory objects that extend
// Asset Library / Projects concepts. Future AI Influencer, Voiceover,
// Dubbing, Product URL to Ad, Marketing Studio, UGC Video, and brand-safe
// generation workflows depend on these stable types.
//
// Profiles reference assets/projects — they do not duplicate media blobs.

import { STORAGE_STATUS_LOCAL_FS } from "./usage";

// ── Shared profile fields ────────────────────────────────────────────────────

export interface ProfileBase {
  id: string;
  userId?: string;
  projectId?: string;
  title: string;
  description?: string;
  tags: string[];
  status: ProfileStatus;
  createdAt: string;
  updatedAt: string;
}

export type ProfileStatus =
  | "draft"
  | "active"
  | "archived"
  | "needs_review";

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
  needs_review: "Needs Review",
};

// ── Consent status (shared across identity-sensitive profiles) ───────────────

export type ConsentStatus =
  | "not_required"
  | "pending"
  | "granted"
  | "denied"
  | "expired"
  | "revoked";

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  not_required: "Not Required",
  pending: "Pending",
  granted: "Granted",
  denied: "Denied",
  expired: "Expired",
  revoked: "Revoked",
};

// ── Safety status (shared across profiles and generation traces) ─────────────

export type ProfileSafetyStatus =
  | "clear"
  | "needs_review"
  | "flagged"
  | "blocked"
  | "consent_required";

export const PROFILE_SAFETY_STATUS_LABELS: Record<ProfileSafetyStatus, string> = {
  clear: "Clear",
  needs_review: "Needs Review",
  flagged: "Flagged",
  blocked: "Blocked",
  consent_required: "Consent Required",
};

// ── CharacterProfile ─────────────────────────────────────────────────────────

export interface CharacterProfile extends ProfileBase {
  profileType: "character";
  displayName: string;
  persona?: string;
  referenceAssetIds: string[];
  styleNotes?: string;
  safetyStatus: ProfileSafetyStatus;
  consentStatus: ConsentStatus;
  disclosureNote?: string;
  useCase?: "internal_ideation" | "client_review" | "external_publishing";
}

export const CHARACTER_USE_CASE_LABELS: Record<string, string> = {
  internal_ideation: "Internal Ideation",
  client_review: "Client Review",
  external_publishing: "External Publishing",
};

// ── VoiceProfile ─────────────────────────────────────────────────────────────

export interface VoiceProfile extends ProfileBase {
  profileType: "voice";
  displayName: string;
  language?: string;
  voiceAssetIds: string[];
  referenceAssetIds: string[];
  consentStatus: ConsentStatus;
  usageRestrictions?: string;
  safetyStatus: ProfileSafetyStatus;
  voiceCharacteristics?: {
    gender?: string;
    ageRange?: string;
    accent?: string;
    style?: string;
    speed?: "slow" | "standard" | "fast";
    tone?: string;
  };
}

// ── ProductProfile ───────────────────────────────────────────────────────────

export type ClaimApprovalStatus =
  | "not_reviewed"
  | "draft"
  | "approved"
  | "flagged"
  | "rejected";

export const CLAIM_APPROVAL_STATUS_LABELS: Record<ClaimApprovalStatus, string> = {
  not_reviewed: "Not Reviewed",
  draft: "Draft",
  approved: "Approved",
  flagged: "Flagged",
  rejected: "Rejected",
};

export interface ProductClaim {
  text: string;
  status: ClaimApprovalStatus;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface ProductProfile extends ProfileBase {
  profileType: "product";
  productName: string;
  sourceUrl?: string;
  productAssetIds: string[];
  claims: ProductClaim[];
  claimApprovalStatus: ClaimApprovalStatus;
  category?: string;
  brandName?: string;
  targetPlatforms?: string[];
}

// ── BrandStyleProfile ────────────────────────────────────────────────────────

export interface BrandStyleProfile extends ProfileBase {
  profileType: "brand_style";
  brandName: string;
  colors?: string[];
  tone?: string;
  logoAssetIds: string[];
  styleReferences?: string;
  typography?: {
    headingFont?: string;
    bodyFont?: string;
    accentFont?: string;
  };
  targetPlatforms?: string[];
  safetyStatus: ProfileSafetyStatus;
}

// ── CampaignProfile ──────────────────────────────────────────────────────────

export type CampaignDeliverableStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled";

export const CAMPAIGN_DELIVERABLE_STATUS_LABELS: Record<CampaignDeliverableStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export interface CampaignDeliverable {
  id: string;
  type: string;
  description: string;
  status: CampaignDeliverableStatus;
  assetIds: string[];
  platform?: string;
  aspectRatio?: string;
}

export interface CampaignProfile extends ProfileBase {
  profileType: "campaign";
  campaignName: string;
  projectId?: string;
  targetPlatforms?: string[];
  deliverables: CampaignDeliverable[];
  assetIds: string[];
  startDate?: string;
  endDate?: string;
  budgetEstimate?: {
    credits?: number;
    providerCostUsd?: number;
    currency?: string;
  };
}

// ── Profile union type ───────────────────────────────────────────────────────

export type CreativeProfile =
  | CharacterProfile
  | VoiceProfile
  | ProductProfile
  | BrandStyleProfile
  | CampaignProfile;

export type CreativeProfileType = CreativeProfile["profileType"];

export const CREATIVE_PROFILE_TYPE_LABELS: Record<CreativeProfileType, string> = {
  character: "Character Profile",
  voice: "Voice Profile",
  product: "Product Profile",
  brand_style: "Brand Style Profile",
  campaign: "Campaign Profile",
};

// ── In-memory store (mirrors assets.ts / projects.ts pattern) ────────────────

let profiles: CreativeProfile[] = [];
let nextProfileId = 1;

function generateProfileId(): string {
  return `profile-${nextProfileId++}-${Date.now()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function seedMockProfiles(): CreativeProfile[] {
  const seeded: CreativeProfile[] = [
    {
      id: generateProfileId(),
      profileType: "character",
      userId: undefined,
      projectId: undefined,
      title: "Nova — Lifestyle Creator",
      description: "AI influencer persona for lifestyle and wellness social campaigns.",
      tags: ["mock", "influencer", "lifestyle"],
      status: "active",
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      displayName: "Nova",
      persona: "Warm, polished lifestyle creator with premium editorial aesthetic. Focused on wellness, skincare, and clean beauty.",
      referenceAssetIds: [],
      styleNotes: "Editorial, natural light, warm tones, minimal neutral fashion.",
      safetyStatus: "consent_required",
      consentStatus: "pending",
      disclosureNote: "Synthetic creator — requires disclosure when publishing externally.",
      useCase: "internal_ideation",
    },
    {
      id: generateProfileId(),
      profileType: "voice",
      userId: undefined,
      projectId: undefined,
      title: "Narrator — Warm English Female",
      description: "Warm female narrator voice for product explainers and brand content.",
      tags: ["mock", "voice", "narration"],
      status: "active",
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      displayName: "Warm Narrator",
      language: "English",
      voiceAssetIds: [],
      referenceAssetIds: [],
      consentStatus: "not_required",
      usageRestrictions: "Internal use only. No external publishing without voice talent agreement.",
      safetyStatus: "clear",
      voiceCharacteristics: {
        gender: "female",
        ageRange: "30-45",
        accent: "US General",
        style: "Warm, precise narration",
        speed: "standard",
        tone: "Warm",
      },
    },
    {
      id: generateProfileId(),
      profileType: "product",
      userId: undefined,
      projectId: undefined,
      title: "Elara Skincare — Renewal Serum",
      description: "Product profile for premium skincare hero campaign.",
      tags: ["mock", "product", "skincare", "beauty"],
      status: "active",
      createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      productName: "Elara Renewal Serum",
      sourceUrl: undefined,
      productAssetIds: [],
      claims: [
        { text: "Clinically tested to improve skin hydration by 40% in 2 weeks.", status: "not_reviewed" },
        { text: "98% naturally derived ingredients.", status: "not_reviewed" },
      ],
      claimApprovalStatus: "not_reviewed",
      category: "Skincare",
      brandName: "Elara Beauty",
      targetPlatforms: ["Instagram", "TikTok", "Amazon"],
    },
    {
      id: generateProfileId(),
      profileType: "brand_style",
      userId: undefined,
      projectId: undefined,
      title: "Elara Beauty — Brand Style",
      description: "Brand style guide for luxury skincare brand.",
      tags: ["mock", "brand", "luxury", "skincare"],
      status: "active",
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      brandName: "Elara Beauty",
      colors: ["#0A0A0A", "#F5F0EB", "#C4A882", "#FFFFFF"],
      tone: "Luxury, clean, science-backed warmth. Premium but approachable.",
      logoAssetIds: [],
      styleReferences: "Clean editorial, minimal studio lighting, glass and ceramic textures, soft neutral palettes.",
      typography: {
        headingFont: "Tiempos",
        bodyFont: "Satoshi",
        accentFont: "Tiempos Italic",
      },
      targetPlatforms: ["Instagram", "TikTok", "PDP", "Amazon"],
      safetyStatus: "clear",
    },
    {
      id: generateProfileId(),
      profileType: "campaign",
      userId: undefined,
      projectId: undefined,
      title: "Summer Renewal 2026 Campaign",
      description: "Multi-platform campaign for the Elara Renewal Serum launch.",
      tags: ["mock", "campaign", "summer", "beauty", "launch"],
      status: "active",
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      campaignName: "Summer Renewal 2026",
      targetPlatforms: ["Instagram", "TikTok", "Meta", "Amazon"],
      deliverables: [
        {
          id: "del-1",
          type: "Hero Image",
          description: "Premium product hero shot with morning light and glass reflections.",
          status: "planned",
          assetIds: [],
          platform: "Instagram",
          aspectRatio: "1:1",
        },
        {
          id: "del-2",
          type: "UGC Video",
          description: "15-second creator-style testimonial with before/after emphasis.",
          status: "planned",
          assetIds: [],
          platform: "TikTok",
          aspectRatio: "9:16",
        },
        {
          id: "del-3",
          type: "Lifestyle Still",
          description: "Lifestyle image with natural morning light and minimal styling.",
          status: "planned",
          assetIds: [],
          platform: "Meta",
          aspectRatio: "4:5",
        },
      ],
      assetIds: [],
      budgetEstimate: {
        credits: 60,
        providerCostUsd: 1.8,
        currency: "USD",
      },
    },
  ];

  profiles = seeded;
  return seeded;
}

export function getProfiles(): CreativeProfile[] {
  return [...profiles];
}

export function getProfileById(id: string): CreativeProfile | undefined {
  return profiles.find((p) => p.id === id);
}

export function getProfilesByType(type: CreativeProfileType): CreativeProfile[] {
  return profiles.filter((p) => p.profileType === type);
}

export function getProfilesByProject(projectId: string): CreativeProfile[] {
  return profiles.filter((p) => p.projectId === projectId);
}

export function addProfile(profile: Omit<CreativeProfile, "id" | "createdAt" | "updatedAt">): CreativeProfile {
  const now = nowIso();
  const created: CreativeProfile = {
    ...profile,
    id: generateProfileId(),
    createdAt: now,
    updatedAt: now,
  } as CreativeProfile;
  profiles.unshift(created);
  return created;
}

export function updateProfile(id: string, patch: Partial<CreativeProfile>): CreativeProfile | null {
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  profiles[idx] = { ...profiles[idx], ...patch, updatedAt: nowIso() } as CreativeProfile;
  return { ...profiles[idx] };
}

export function deleteProfile(id: string): boolean {
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  profiles.splice(idx, 1);
  return true;
}

export function linkAssetToProfile(profileId: string, assetId: string): CreativeProfile | null {
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return null;
  const assetListField = {
    character: "referenceAssetIds",
    voice: "voiceAssetIds",
    product: "productAssetIds",
    brand_style: "logoAssetIds",
    campaign: "assetIds",
  }[profile.profileType] as keyof CreativeProfile | undefined;
  if (!assetListField) return null;
  const list = profile[assetListField] as string[] | undefined;
  if (list && !list.includes(assetId)) {
    list.push(assetId);
    profile.updatedAt = nowIso();
  }
  return { ...profile };
}

export function clearProfiles(): void {
  profiles = [];
  nextProfileId = 1;
}

export const PROFILE_STORE_DURABILITY = STORAGE_STATUS_LOCAL_FS;

// ─── Durable storage hooks (called by server-side sync layer) ────────────

export function hydrateProfileStore(newProfiles: CreativeProfile[], newNextId: number): void {
  profiles = newProfiles;
  nextProfileId = newNextId;
}

export function snapshotProfileStore(): CreativeProfile[] {
  return [...profiles];
}

export function snapshotProfileNextId(): number {
  return nextProfileId;
}
