/**
 * Studio V5 — composer quality profile over the canonical generation
 * profiles (FAST / BALANCED / QUALITY / CUSTOM).
 *
 * The composer only names the profile; lib/media/generation-profiles maps
 * it onto the fields the resolved endpoint schema actually supports and
 * reports what it had to omit. Without a resolved endpoint (Auto before
 * routing) nothing is mapped and the caller says so. CUSTOM contributes no
 * parameters — the inspector's schema controls are the whole request.
 */

import type { EndpointSpec } from "@ethen/studio-core/catalog";
import { deriveKnobs, mapProfile, type GenerationProfileId } from "../../../../lib/media/generation-profiles";
import type { ControlDef } from "../../../../lib/media/schema-store";
import { adaptSchemaControls } from "./CreateSchemaControls";

export const QUALITY_PROFILES: readonly { id: GenerationProfileId; label: string }[] = [
  { id: "fast", label: "Fast" },
  { id: "balanced", label: "Balanced" },
  { id: "quality", label: "Quality" },
  { id: "custom", label: "Custom" },
];

export type QualityProfileId = GenerationProfileId;

export interface ProfileApplication {
  params: Readonly<Record<string, unknown>>;
  /** Human summary for the inspector; never claims a knob the endpoint lacks. */
  summary: string;
}

export function applyQualityProfile(spec: EndpointSpec | null, profile: QualityProfileId): ProfileApplication {
  if (profile === "custom") return { params: {}, summary: "Custom — only the settings below are sent." };
  if (!spec) return { params: {}, summary: "Maps onto the endpoint's supported settings once a model is routed." };
  const controls: ControlDef[] = adaptSchemaControls(spec).controls.map((control) => ({
    name: control.name,
    kind: control.kind === "integer" ? "number" : control.kind,
    label: control.label,
    required: control.required,
    defaultValue: control.defaultValue,
    enumValues: control.enumValues ?? undefined,
    min: control.min ?? undefined,
    max: control.max ?? undefined,
    raw: null,
    unsupportedReason: control.unsupportedReason,
  }));
  const mapping = mapProfile(profile, deriveKnobs({ controls, blockingUnsupported: [], degraded: {} }), "");
  const set = Object.keys(mapping.params);
  return {
    params: mapping.params,
    summary: set.length > 0 ? `Sets ${set.join(", ")} for this endpoint.` : "This endpoint exposes no quality, step or guidance settings.",
  };
}
