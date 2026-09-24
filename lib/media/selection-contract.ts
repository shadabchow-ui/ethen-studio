/**
 * Studio V3 Job 2 — shared command/selection contract (for Jobs 3-4).
 *
 * Binds project + endpoint-or-Auto + profile + validated params + typed refs.
 * Auto resolves deterministically from stated signals only; unknown signals
 * are excluded with reasons, never estimated. Explicit selection validates
 * against schema support; executability itself is qualified by Job 3.
 */

import type { StudioEndpoint } from "./endpoint-registry";
import type { GenerationProfileId } from "./generation-profiles";

export type ReferenceKind = "image" | "video" | "audio" | "text";

export interface StudioReference {
  kind: ReferenceKind;
  /** Durable asset id or public URL (never raw bytes). */
  locator: string;
  mimeType: string | null;
}

export interface StudioSelection {
  contractVersion: 1;
  projectId: string;
  endpointId: string | "auto";
  profile: GenerationProfileId;
  params: Readonly<Record<string, unknown>>;
  refs: readonly StudioReference[];
}

export interface AutoSignals {
  task: string;
  inputKinds: readonly ReferenceKind[];
  requiredCapabilities: readonly string[];
  qualityPreference: "low" | "mid" | "high";
  speedPreference: "low" | "mid" | "high";
  costPreference: "low" | "mid" | "high";
}

export interface AutoReceipt {
  endpointId: string | null;
  considered: number;
  excluded: Readonly<Record<string, string>>;
  reasons: readonly string[];
}

const MIME_BY_KIND: Readonly<Record<ReferenceKind, readonly string[]>> = {
  image: ["image/png", "image/jpeg", "image/webp"],
  video: ["video/mp4", "video/webm"],
  audio: ["audio/mpeg", "audio/wav", "audio/webm"],
  text: ["text/plain"],
};

export function validateReference(ref: StudioReference): string | null {
  if (!ref.locator || ref.locator.length === 0) return "empty locator";
  if (ref.locator.length > 2048) return "locator too long";
  if (ref.mimeType && !MIME_BY_KIND[ref.kind].includes(ref.mimeType)) {
    return `mime ${ref.mimeType} not allowed for ${ref.kind}`;
  }
  return null;
}

function scoreEndpoint(endpoint: StudioEndpoint, signals: AutoSignals): { score: number; veto: string | null } {
  if (endpoint.disposition !== "eligible") return { score: 0, veto: `disposition ${endpoint.disposition}` };
  if (endpoint.schema.status !== "supported") return { score: 0, veto: "no verified input schema" };
  if (endpoint.task !== signals.task) return { score: 0, veto: `task ${endpoint.task} !== ${signals.task}` };
  const supported = new Set(endpoint.capabilities.supportedInputs ?? []);
  for (const cap of signals.requiredCapabilities) {
    if (!supported.has(cap)) return { score: 0, veto: `missing capability ${cap}` };
  }
  let score = 100;
  const reasons: string[] = [];
  if (signals.costPreference === "low" && endpoint.pricing.status === "unknown") {
    score -= 5;
    reasons.push("unknown pricing deprioritized for cost-low");
  }
  void reasons;
  return { score, veto: null };
}

/** Deterministic Auto: highest score wins, ties break by endpoint id. */
export function resolveAuto(
  endpoints: readonly StudioEndpoint[],
  signals: AutoSignals,
): AutoReceipt {
  const excluded: Record<string, string> = {};
  let best: StudioEndpoint | null = null;
  let bestScore = -1;
  let considered = 0;
  for (const endpoint of endpoints) {
    considered += 1;
    const { score, veto } = scoreEndpoint(endpoint, signals);
    if (veto) {
      excluded[endpoint.endpointId] = veto;
      continue;
    }
    if (score > bestScore || (score === bestScore && best && endpoint.endpointId < best.endpointId)) {
      best = endpoint;
      bestScore = score;
    }
  }
  const reasons: string[] = [];
  if (best) {
    reasons.push(`selected ${best.endpointId}: eligible, schema-supported, task ${signals.task}`);
  } else {
    reasons.push("no eligible schema-supported endpoint for task; explicit selection or Job 3 runtime required");
  }
  reasons.push("health, availability and historical success unknown: excluded from ranking");
  reasons.push("latency/quality unmeasured: excluded from ranking");
  return { endpointId: best?.endpointId ?? null, considered, excluded, reasons };
}

export function validateSelection(
  selection: StudioSelection,
  endpoints: readonly StudioEndpoint[],
): { ok: boolean; errors: readonly string[] } {
  const errors: string[] = [];
  if (!selection.projectId) errors.push("projectId required");
  if (selection.endpointId !== "auto") {
    const endpoint = endpoints.find((e) => e.endpointId === selection.endpointId);
    if (!endpoint) errors.push(`unknown endpoint ${selection.endpointId}`);
    else {
      if (endpoint.disposition !== "eligible") errors.push(`endpoint ${selection.endpointId} is ${endpoint.disposition}`);
      if (endpoint.schema.status !== "supported") errors.push(`endpoint ${selection.endpointId} has no verified schema`);
    }
  }
  selection.refs.forEach((ref, i) => {
    const problem = validateReference(ref);
    if (problem) errors.push(`refs[${i}]: ${problem}`);
  });
  return { ok: errors.length === 0, errors };
}
