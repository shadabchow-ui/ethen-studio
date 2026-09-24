/**
 * Studio V3 Job 2 — deterministic capability-aware generation profiles.
 *
 * FAST / BALANCED / QUALITY / CUSTOM map through each endpoint's supported
 * inputs only — never universal steps/quality knobs. A profile emits only
 * fields the endpoint schema supports; anything else is omitted with a
 * reason. CUSTOM permits only supported validated fields. Consumes Job 1
 * routing preferences (preferred provider, fallback, queue priority) via a
 * structural input — no new package direction.
 */

import type { AdaptedControls } from "./schema-store";

export type GenerationProfileId = "fast" | "balanced" | "quality" | "custom";

export interface Job1RoutingPrefs {
  preferredProvider: string;
  allowFallback: boolean;
  queuePriority: string;
}

export interface ProfileMapping {
  profile: GenerationProfileId;
  params: Readonly<Record<string, unknown>>;
  /** Supported fields the profile intentionally left at endpoint defaults. */
  untouched: readonly string[];
  /** Desired knobs the endpoint cannot express. */
  omitted: Readonly<Record<string, string>>;
}

export interface EndpointKnobs {
  supportsQuality: boolean;
  supportsSteps: boolean;
  supportsGuidance: boolean;
  supportsSeed: boolean;
  qualityField: string | null;
  stepsField: string | null;
  guidanceField: string | null;
  qualityValues: readonly string[];
  stepsRange: { min: number; max: number } | null;
  guidanceRange: { min: number; max: number } | null;
  resolutionValues: readonly string[];
}

/** Derive mappable knobs from adapted controls (names, not guesses). */
export function deriveKnobs(adapted: AdaptedControls): EndpointKnobs {
  const byName = new Map(adapted.controls.map((c) => [c.name.toLowerCase(), c]));
  const find = (...names: string[]) => {
    for (const n of names) {
      const hit = byName.get(n);
      if (hit) return hit;
    }
    return undefined;
  };
  const quality = find("quality", "image_quality", "video_quality");
  const steps = find("num_inference_steps", "steps", "inference_steps", "num_steps");
  const guidance = find("guidance_scale", "guidance", "cfg_scale", "cfg");
  const seed = find("seed");
  const resolution = find("resolution", "image_size", "size");
  return {
    supportsQuality: Boolean(quality && quality.kind === "enum" && quality.enumValues?.length),
    supportsSteps: Boolean(steps && steps.kind === "number"),
    supportsGuidance: Boolean(guidance && guidance.kind === "number"),
    supportsSeed: Boolean(seed),
    qualityField: quality?.name ?? null,
    stepsField: steps?.name ?? null,
    guidanceField: guidance?.name ?? null,
    qualityValues: quality?.enumValues ?? [],
    stepsRange: steps && steps.kind === "number" && (steps.min !== undefined || steps.max !== undefined)
      ? { min: steps.min ?? 1, max: steps.max ?? 50 }
      : null,
    guidanceRange: guidance && guidance.kind === "number" && (guidance.min !== undefined || guidance.max !== undefined)
      ? { min: guidance.min ?? 0, max: guidance.max ?? 20 }
      : null,
    resolutionValues: resolution?.kind === "enum" && resolution.enumValues ? resolution.enumValues : [],
  };
}

const QUALITY_RANK = ["draft", "standard", "high"] as const;

function pickRanked(values: readonly string[], want: "low" | "mid" | "high"): string | null {
  if (values.length === 0) return null;
  const lower = values.map((v) => v.toLowerCase());
  const rankOf = (v: string): number => {
    if (/draft|low|fast|preview|turbo/.test(v)) return 0;
    if (/standard|balanced|medium|default/.test(v)) return 1;
    if (/high|ultra|quality|max|pro/.test(v)) return 2;
    return 1;
  };
  const target = want === "low" ? 0 : want === "high" ? 2 : 1;
  let best = values[0], bestDist = Math.abs(rankOf(lower[0]) - target);
  for (let i = 1; i < values.length; i += 1) {
    const dist = Math.abs(rankOf(lower[i]) - target);
    if (dist < bestDist) { best = values[i]; bestDist = dist; }
  }
  return best;
}

function scale(range: { min: number; max: number }, t: number): number {
  return Math.round(range.min + (range.max - range.min) * t);
}

export function mapProfile(
  profile: GenerationProfileId,
  knobs: EndpointKnobs,
  job1Quality: string,
): ProfileMapping {
  const params: Record<string, unknown> = {};
  const untouched: string[] = [];
  const omitted: Record<string, string> = {};
  const want = profile === "fast" ? "low" : profile === "quality" ? "high" : "mid";

  if (knobs.supportsQuality && knobs.qualityField) {
    const ranked = QUALITY_RANK.includes(job1Quality as (typeof QUALITY_RANK)[number]) ? job1Quality : null;
    const match = ranked && knobs.qualityValues.some((v) => v.toLowerCase() === ranked)
      ? knobs.qualityValues.find((v) => v.toLowerCase() === ranked)!
      : pickRanked(knobs.qualityValues, profile === "custom" ? "mid" : want);
    if (match) params[knobs.qualityField] = match;
    else omitted[knobs.qualityField] = "no mappable quality value";
  } else {
    omitted.quality = "endpoint exposes no quality enum";
  }

  if (knobs.stepsRange && knobs.stepsField) {
    const t = profile === "fast" ? 0.25 : profile === "quality" ? 0.85 : 0.5;
    params[knobs.stepsField] = scale(knobs.stepsRange, profile === "custom" ? 0.5 : t);
  } else if (knobs.supportsSteps && knobs.stepsField) {
    untouched.push(knobs.stepsField);
  } else {
    omitted.num_inference_steps = "endpoint exposes no step count";
  }

  if (knobs.guidanceRange && knobs.guidanceField) {
    const t = profile === "fast" ? 0.3 : profile === "quality" ? 0.7 : 0.5;
    params[knobs.guidanceField] = scale(knobs.guidanceRange, profile === "custom" ? 0.5 : t);
  } else if (knobs.supportsGuidance && knobs.guidanceField) {
    untouched.push(knobs.guidanceField);
  } else {
    omitted.guidance_scale = "endpoint exposes no guidance scale";
  }

  if (!knobs.supportsSeed) omitted.seed = "endpoint exposes no seed input";
  if (knobs.resolutionValues.length === 0) omitted.resolution = "endpoint exposes no resolution enum";

  return { profile, params, untouched, omitted };
}

export interface RoutingDecision {
  preferredProvider: string;
  allowFallback: boolean;
  queuePriority: string;
  notes: readonly string[];
}

/** Pass Job 1 routing prefs through with explicit notes (no silent changes). */
export function routeWithPrefs(prefs: Job1RoutingPrefs): RoutingDecision {
  const notes: string[] = [];
  if (prefs.preferredProvider !== "auto" && prefs.preferredProvider !== "fal") {
    notes.push(`preferred provider ${prefs.preferredProvider} has no Studio route; fal.ai remains the only provider`);
  }
  if (!prefs.allowFallback) notes.push("fallback disabled: single-route attempts only");
  return {
    preferredProvider: prefs.preferredProvider,
    allowFallback: prefs.allowFallback,
    queuePriority: prefs.queuePriority,
    notes,
  };
}
