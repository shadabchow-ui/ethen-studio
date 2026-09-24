/** Studio V5 kernel — identity: versioned bundles + voice bindings. */
import type { ProjectScope } from "./scope";

export type IdentityKind = "voice" | "character" | "product" | "brand";
export type IdentityOrigin = "stock" | "designed" | "cloned" | "imported";

export interface IdentityBundle {
  identityId: string;
  version: number;
  scope: ProjectScope;
  kind: IdentityKind;
  origin: IdentityOrigin;
  contentHash: string;
  consentGrantId: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** VoiceIdentity → VoiceBinding → ModelEndpoint; selectors stay independent. */
export interface VoiceBinding {
  bindingId: string;
  identityId: string;
  identityVersion: number;
  endpointId: string;
  adapterVersion: string;
  compatibleModelIds: readonly string[];
  revokedAt: string | null;
}
