/**
 * STUDIO_10 — identity/voice selector shared contracts.
 *
 * Browser-safe: view models only. Voice selection (an identity id) and
 * model selection (an endpoint id) are independent slots; compatibility
 * is explanatory and never re-pins the other slot.
 */

export type IdentityKind = "voice" | "character" | "product" | "brand";

export type IdentityOrigin = "stock" | "designed" | "cloned" | "imported";

export type IdentityLibraryTab = "my" | "stock" | "favorites" | "recent";

export const IDENTITY_LIBRARY_TABS: readonly IdentityLibraryTab[] = ["my", "stock", "favorites", "recent"];

export const IDENTITY_TAB_LABELS: Record<IdentityLibraryTab, string> = {
  my: "My voices",
  stock: "Stock",
  favorites: "Favorites",
  recent: "Recent",
};

export type IdentityConsentView = "active" | "revoked" | "expired" | "needs_review" | "unknown" | "none";

export interface IdentityListItem {
  identityId: string;
  kind: IdentityKind;
  origin: IdentityOrigin;
  name: string;
  currentVersion: number;
  status: "active" | "quarantined";
  stock: boolean;
  favorite: boolean;
  consent: IdentityConsentView;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityVersionView {
  version: number;
  contentHash: string;
  consentGrantId: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export type VoiceBindingState = "bound" | "pending" | "revoked";

export interface VoiceBindingView {
  bindingId: string;
  identityVersion: number;
  providerId: string;
  providerVoiceId: string;
  endpointId: string | null;
  adapterVersion: string;
  compatibleModelIds: readonly string[];
  loraRefs: readonly string[];
  state: VoiceBindingState;
  createdAt: string;
}

export interface CompatibleModelView {
  endpointId: string;
  familyId: string;
  label: string;
  executable: boolean;
  reasons: readonly string[];
}

/** Voice slot: identity reference only — never inline provider blobs or model ids. */
export interface IdentityVoiceSelection {
  voiceIdentityId: string | null;
  voiceVersion: number | null;
}

/** Model slot: Auto routing or an explicit pinned endpoint. */
export interface IdentityModelSelection {
  selection: "auto" | string;
  endpointLabel: string | null;
  disabledReason: string | null;
}

export type IdentityCreationFlow = "design" | "clone";

export interface IdentityCreationDraft {
  flow: IdentityCreationFlow;
  name: string;
  purpose: string;
  evidenceRef: string;
  locale: string;
  capability: string;
}
