// ── Rights / Disclosure Checklist ─────────────────────────────────────────────
// Checklist type for the export/asset inspector before publishing or downloading.
// Honest labels: beta, setup_required, manual_review, not full legal compliance.

import type { MediaJob } from "./types";
import { getTracesByJob } from "./traces";

export interface RightsDisclosureItem {
  id: string;
  label: string;
  question: string;
  checked: boolean;
  applicable: boolean;
  note: string;
  severity: "info" | "warning" | "block";
}

export interface RightsDisclosureChecklist {
  items: RightsDisclosureItem[];
  allApplicableChecked: boolean;
  anyBlockingUnchecked: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
}

export function buildRightsDisclosureChecklist(input: {
  job?: MediaJob | null;
  hasSyntheticPerson?: boolean;
  hasVoiceClone?: boolean;
  hasFaceSwap?: boolean;
  hasPublicFigure?: boolean;
  hasProductClaims?: boolean;
  isExternalPublishing?: boolean;
  hasAIOutput?: boolean;
}): RightsDisclosureChecklist {
  const items: RightsDisclosureItem[] = [];

  // 1. AI-generated disclosure
  items.push({
    id: "ai_disclosure",
    label: "AI Disclosure",
    question: "Will this AI-generated content include a clear AI disclosure when published?",
    checked: false,
    applicable: input.hasAIOutput ?? true,
    note: input.hasAIOutput
      ? "Beta recommendation — not full legal compliance."
      : "Not applicable for non-AI outputs.",
    severity: "warning",
  });

  // 2. Commercial use
  items.push({
    id: "commercial_use",
    label: "Commercial Use",
    question: "Have you verified the provider/model terms allow commercial use?",
    checked: false,
    applicable: true,
    note: "Check provider terms of service. Ethen does not guarantee commercial-use rights (beta).",
    severity: "warning",
  });

  // 3. Synthetic person
  items.push({
    id: "synthetic_person",
    label: "Synthetic Person",
    question: "Does this content depict a synthetic person? If so, is disclosure included?",
    checked: false,
    applicable: input.hasSyntheticPerson ?? false,
    note: input.hasSyntheticPerson
      ? "Synthetic people require disclosure when published externally (beta — not full legal compliance)."
      : "Not applicable.",
    severity: input.hasSyntheticPerson ? "warning" : "info",
  });

  // 4. Voice clone
  items.push({
    id: "voice_clone",
    label: "Voice Clone",
    question: "Does this content use a cloned voice? Has consent been documented?",
    checked: false,
    applicable: input.hasVoiceClone ?? false,
    note: input.hasVoiceClone
      ? "Voice cloning requires documented consent from the voice owner (beta — manual_review recommended)."
      : "Not applicable.",
    severity: input.hasVoiceClone ? "block" : "info",
  });

  // 5. Face swap / identity
  items.push({
    id: "face_swap_identity",
    label: "Face / Identity Swap",
    question: "Does this content involve face swapping or identity manipulation? Has likeness consent been documented?",
    checked: false,
    applicable: input.hasFaceSwap ?? false,
    note: input.hasFaceSwap
      ? "Face/identity swaps require explicit documented consent from the depicted person (beta — manual_review recommended)."
      : "Not applicable.",
    severity: input.hasFaceSwap ? "block" : "info",
  });

  // 6. Public figure
  items.push({
    id: "public_figure",
    label: "Public Figure",
    question: "Does this content depict or reference a public figure? Has consent been obtained?",
    checked: false,
    applicable: input.hasPublicFigure ?? false,
    note: input.hasPublicFigure
      ? "Public figure depiction carries significant legal risk. Verify consent and review before publishing (beta — not full legal compliance)."
      : "Not applicable.",
    severity: input.hasPublicFigure ? "block" : "info",
  });

  // 7. Product claims
  items.push({
    id: "product_claims",
    label: "Product Claims",
    question: "Does this content include product claims? Have they been verified for accuracy?",
    checked: false,
    applicable: input.hasProductClaims ?? false,
    note: input.hasProductClaims
      ? "Product claims must be accurate and verifiable before external publishing (beta — manual_review recommended)."
      : "Not applicable.",
    severity: input.hasProductClaims ? "warning" : "info",
  });

  // 8. External publishing
  items.push({
    id: "external_publishing",
    label: "External Publishing",
    question: "Will this content be published externally? Have all applicable disclosures been verified?",
    checked: false,
    applicable: input.isExternalPublishing ?? false,
    note: input.isExternalPublishing
      ? "External publishing requires review of all applicable disclosures and claims (beta)."
      : "Not applicable — internal use only.",
    severity: input.isExternalPublishing ? "warning" : "info",
  });

  // 9. Provenance
  items.push({
    id: "provenance",
    label: "Provenance Available",
    question: "Is provider/model metadata attached to this output for provenance tracking?",
    checked: true, // Always checked by default — we always attach metadata
    applicable: true,
    note: "Provider, model, timestamp, and trace ID metadata are attached to the output (beta — not C2PA signing).",
    severity: "info",
  });

  // 10. Provider/model metadata
  items.push({
    id: "provider_model_metadata",
    label: "Provider / Model Metadata",
    question: "Have provider ID, model ID, and generation parameters been recorded with this asset?",
    checked: true, // Always checked by default
    applicable: true,
    note: "Provider and model metadata are attached to the asset. This is not C2PA-level provenance.",
    severity: "info",
  });

  const applicable = items.filter((i) => i.applicable);
  const allApplicableChecked = applicable.every((i) => i.checked);
  const anyBlockingUnchecked = applicable.some((i) => i.severity === "block" && !i.checked);

  return {
    items,
    allApplicableChecked,
    anyBlockingUnchecked,
  };
}

export function buildRightsDisclosureFromJob(
  job: MediaJob,
  hasSyntheticPerson?: boolean,
): RightsDisclosureChecklist {
  const traces = getTracesByJob(job.id);
  const trace = traces.length > 0 ? traces[0] : null;

  const safetyCategories = new Set(
    trace?.safetyGateResult?.categories ?? [],
  );

  return buildRightsDisclosureChecklist({
    job,
    hasAIOutput: true,
    hasSyntheticPerson: hasSyntheticPerson ?? false,
    hasVoiceClone: safetyCategories.has("voice_cloning") || safetyCategories.has("voice_change"),
    hasFaceSwap: safetyCategories.has("face_swap") || safetyCategories.has("character_swap"),
    hasPublicFigure: safetyCategories.has("public_figures"),
    hasProductClaims: safetyCategories.has("product_claims") || safetyCategories.has("fake_product_claims"),
    isExternalPublishing: safetyCategories.has("external_publishing"),
  });
}
