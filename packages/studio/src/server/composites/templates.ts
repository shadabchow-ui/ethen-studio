/**
 * Studio V5 composites — immutable versioned composition templates (STUDIO_15).
 * Templates select existing WorkflowApp inputs; they never orchestrate
 * providers directly. Frozen with SHA-256; versions append-only.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { IdentityKind } from "../../contracts/identity";
import {
  ASPECT_VARIANTS,
  COMPOSITE_KINDS,
  compositeError,
  type CompositionTemplate,
  type CompositeKind,
  type TemplateInputBinding,
} from "./types";

export const COMPOSITE_TEMPLATE_SCHEMA_VERSION = 1;

export interface FreezeTemplateInput {
  templateId: string;
  version: number;
  kind: CompositeKind;
  title: string;
  description: string;
  appId: string;
  aspectIds: readonly string[];
  inputs: readonly TemplateInputBinding[];
  requiredIdentities: readonly IdentityKind[];
}

function canonicalTemplatePayload(input: FreezeTemplateInput): string {
  const sortedAspects = [...input.aspectIds].sort();
  const sortedInputs = [...input.inputs]
    .map((i) => ({ field: i.field, source: i.source, required: i.required }))
    .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
  const sortedIdentities = [...input.requiredIdentities].sort();
  return JSON.stringify({
    schemaVersion: COMPOSITE_TEMPLATE_SCHEMA_VERSION,
    templateId: input.templateId,
    version: input.version,
    kind: input.kind,
    title: input.title,
    description: input.description,
    appId: input.appId,
    aspectIds: sortedAspects,
    inputs: sortedInputs,
    requiredIdentities: sortedIdentities,
  });
}

export function hashTemplate(input: FreezeTemplateInput): string {
  return createHash("sha256").update(canonicalTemplatePayload(input), "utf8").digest("hex");
}

/** Freeze one immutable template version. Pure; throws CompositeError. */
export function freezeTemplate(input: FreezeTemplateInput, createdAt: string): CompositionTemplate {
  if (!input.templateId.trim()) throw compositeError("BAD_REQUEST", "Template id is required.");
  if (!Number.isInteger(input.version) || input.version <= 0) {
    throw compositeError("BAD_REQUEST", "Template version must be a positive integer.");
  }
  if (!COMPOSITE_KINDS.includes(input.kind)) throw compositeError("BAD_REQUEST", `Unknown composite kind.`);
  if (!input.title.trim()) throw compositeError("BAD_REQUEST", "Template title is required.");
  if (!input.appId.trim()) throw compositeError("BAD_REQUEST", "Template must bind a WorkflowApp id.");
  if (input.aspectIds.length === 0) throw compositeError("BAD_REQUEST", "Template needs at least one aspect.");
  for (const aspectId of input.aspectIds) {
    if (!ASPECT_VARIANTS[aspectId]) throw compositeError("BAD_REQUEST", `Unknown aspect "${aspectId}".`);
  }
  if (input.inputs.length === 0) throw compositeError("BAD_REQUEST", "Template needs at least one app input binding.");
  const fields = new Set<string>();
  for (const binding of input.inputs) {
    if (!binding.field.trim()) throw compositeError("BAD_REQUEST", "Template input field is required.");
    if (fields.has(binding.field)) throw compositeError("BAD_REQUEST", `Duplicate template input "${binding.field}".`);
    fields.add(binding.field);
  }
  return {
    templateId: input.templateId,
    version: input.version,
    kind: input.kind,
    title: input.title,
    description: input.description,
    appId: input.appId,
    aspectIds: [...input.aspectIds],
    inputs: input.inputs.map((i) => ({ ...i })),
    requiredIdentities: [...input.requiredIdentities],
    contentHash: hashTemplate(input),
    createdAt,
  };
}

/** First useful marketing template: product launch across 3 aspects. */
export function seedMarketingTemplate(createdAt: string): CompositionTemplate {
  return freezeTemplate(
    {
      templateId: "marketing-product-launch",
      version: 1,
      kind: "marketing",
      title: "Product launch",
      description: "Brief-led product launch: product + brand identity, caption and soundtrack across square, vertical and widescreen.",
      appId: "marketing-launch-app",
      aspectIds: ["1:1", "9:16", "16:9"],
      inputs: [
        { field: "product", source: "identity", required: true },
        { field: "brand", source: "identity", required: true },
        { field: "headline", source: "brief", required: true },
        { field: "caption", source: "brief", required: true },
        { field: "soundtrack", source: "soundtrack", required: false },
        { field: "aspect", source: "aspect", required: true },
      ],
      requiredIdentities: ["product", "brand"],
    },
    createdAt,
  );
}

/** First useful influencer template: character story across 2 aspects. */
export function seedInfluencerTemplate(createdAt: string): CompositionTemplate {
  return freezeTemplate(
    {
      templateId: "influencer-character-story",
      version: 1,
      kind: "influencer",
      title: "Character story",
      description: "Character + voice story episode: pinned character identity, voice binding, script caption and soundtrack.",
      appId: "influencer-story-app",
      aspectIds: ["9:16", "1:1"],
      inputs: [
        { field: "character", source: "identity", required: true },
        { field: "voice", source: "identity", required: true },
        { field: "script", source: "brief", required: true },
        { field: "caption", source: "brief", required: true },
        { field: "soundtrack", source: "soundtrack", required: false },
        { field: "aspect", source: "aspect", required: true },
      ],
      requiredIdentities: ["character", "voice"],
    },
    createdAt,
  );
}

export function seedCompositeTemplates(createdAt: string): CompositionTemplate[] {
  return [seedMarketingTemplate(createdAt), seedInfluencerTemplate(createdAt)];
}
