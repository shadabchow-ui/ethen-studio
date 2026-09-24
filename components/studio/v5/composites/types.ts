/**
 * STUDIO_15 — composites UI types (client-safe: no server imports).
 * Guided brief → references → variants → review over versioned templates.
 */

export type CompositeKindView = "marketing" | "influencer";

export const COMPOSITE_KINDS_VIEW: readonly CompositeKindView[] = ["marketing", "influencer"];

export function isCompositeKindView(value: string): value is CompositeKindView {
  return (COMPOSITE_KINDS_VIEW as readonly string[]).includes(value);
}

export interface TemplateView {
  templateId: string;
  version: number;
  kind: string;
  title: string;
  description: string;
  appId: string;
  aspects: string[];
  inputs: { field: string; source: string; required: boolean }[];
  requiredIdentities: string[];
  contentHash: string;
}

export interface CampaignBriefView {
  audience: string;
  hook: string;
  cta: string;
  caption: string;
  soundtrackAssetId: string | null;
  capIcu: number;
}

export interface CampaignView {
  campaignId: string;
  kind: string;
  title: string;
  templateId: string | null;
  templateVersion: number | null;
  appId: string | null;
  brief: CampaignBriefView;
  jobTreeId: string;
  status: string;
  briefRevision: number;
}

export interface PinnedIdentityView {
  identityId: string;
  version: number;
  kind: string;
  contentHash: string;
  consentGrantId: string | null;
}

export interface VariantView {
  variantId: string;
  campaignId: string;
  aspectId: string;
  identities: PinnedIdentityView[];
  payloadHash: string;
  variantRevision: number;
  estimatedCostIcu: number;
  jobId: string | null;
  status: string;
  refusalReason: string | null;
}

export interface ReviewView {
  reviewId: string;
  campaignId: string;
  status: string;
  pinnedVariants: Record<string, string>;
  briefRevision: number;
  decidedBy: string | null;
  feedback: string | null;
  expiresAt: string | null;
}

export type CompositeStep = "brief" | "references" | "variants" | "review";

export const COMPOSITE_STEPS: readonly CompositeStep[] = ["brief", "references", "variants", "review"];

export const COMPOSITE_STEP_LABELS: Readonly<Record<CompositeStep, string>> = {
  brief: "Brief",
  references: "References",
  variants: "Variants",
  review: "Review",
};

export type CompositeUiState =
  | { state: "loading" }
  | { state: "setup"; message: string; dependency?: string | null }
  | { state: "empty"; message: string }
  | { state: "error"; message: string }
  | { state: "ready" };

export function formatIcu(icu: number): string {
  return `${icu.toLocaleString("en-US")} ICU`;
}
