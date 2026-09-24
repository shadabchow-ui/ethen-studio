import { createHash } from "node:crypto";
import type { MIConfidence, MIProvenance } from "./provenance";

export const MI_EVIDENCE_SCHEMA_VERSION = "mi-evidence-r3.0";
export const MI_FRESHNESS_POLICY_VERSION = "mi-freshness-r3.0";
export type MISourceType = "provider_official" | "provider_documentation" | "provider_pricing" | "benchmark_dataset" | "internal_eval" | "gateway_runtime_measurement" | "curated_manual" | "normalized_legacy" | "unknown";
export type MIFactClass = "identity" | "capabilities" | "context_limits" | "pricing" | "provider_policy" | "benchmark_results" | "release_deprecation";
export type MIVerificationState = "known" | "fresh" | "stale" | "expired" | "unknown" | "conflict" | "invalid";

export interface MIFactEvidence<T> {
  value: T | null;
  source: string | null;
  sourceType: MISourceType;
  sourceLabel: string;
  retrievedAt: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  sourceHash: string | null;
  methodology: string | null;
  methodologyVersion: string | null;
  confidence: MIConfidence;
  verificationState: MIVerificationState;
  diagnostics: string[];
}

export const MI_FRESHNESS_POLICY: Readonly<Record<MIFactClass, { maxAgeDays: number }>> = {
  identity: { maxAgeDays: 3650 }, capabilities: { maxAgeDays: 365 }, context_limits: { maxAgeDays: 180 },
  pricing: { maxAgeDays: 30 }, provider_policy: { maxAgeDays: 180 }, benchmark_results: { maxAgeDays: 365 }, release_deprecation: { maxAgeDays: 90 },
};

function validDate(value: string | null): boolean { return value !== null && !Number.isNaN(Date.parse(value)); }
export function deterministicSourceHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function evidenceFromProvenance<T>(value: T | null, provenance: MIProvenance, sourceType: MISourceType = "normalized_legacy", effectiveAt: string | null = null): MIFactEvidence<T> {
  return { value, source: provenance.sourceUrl, sourceType, sourceLabel: provenance.sourceLabel, retrievedAt: provenance.retrievedAt, effectiveAt, expiresAt: null, sourceHash: provenance.sourceUrl ? deterministicSourceHash(provenance.sourceUrl) : null, methodology: provenance.methodology, methodologyVersion: null, confidence: provenance.confidence, verificationState: "unknown", diagnostics: [] };
}
export function evaluateEvidence<T>(evidence: MIFactEvidence<T>, factClass: MIFactClass, now = new Date()): MIFactEvidence<T> {
  const diagnostics: string[] = [];
  if (evidence.value === null) return { ...evidence, verificationState: "unknown", diagnostics: ["Value is not available."] };
  if (evidence.sourceType === "unknown" || !evidence.source || !evidence.methodology || !validDate(evidence.retrievedAt)) {
    if (!evidence.source) diagnostics.push("Missing required source.");
    if (!evidence.methodology) diagnostics.push("Missing required methodology.");
    if (!validDate(evidence.retrievedAt)) diagnostics.push("Invalid or missing retrieval date.");
    return { ...evidence, verificationState: "invalid", diagnostics };
  }
  if (evidence.effectiveAt && !validDate(evidence.effectiveAt)) return { ...evidence, verificationState: "invalid", diagnostics: ["Invalid effective date."] };
  if (evidence.expiresAt && !validDate(evidence.expiresAt)) return { ...evidence, verificationState: "invalid", diagnostics: ["Invalid expiry date."] };
  if (evidence.expiresAt && Date.parse(evidence.expiresAt) < now.getTime()) return { ...evidence, verificationState: "expired", diagnostics };
  const ageDays = (now.getTime() - Date.parse(evidence.retrievedAt!)) / 86_400_000;
  return { ...evidence, verificationState: ageDays > MI_FRESHNESS_POLICY[factClass].maxAgeDays ? "stale" : "fresh", diagnostics };
}
export function resolveEvidenceCandidates<T>(candidates: MIFactEvidence<T>[], factClass: MIFactClass, now = new Date()): MIFactEvidence<T> {
  const evaluated = candidates.map((candidate) => evaluateEvidence(candidate, factClass, now));
  const usable = evaluated.filter((candidate) => candidate.verificationState === "fresh" || candidate.verificationState === "stale");
  if (usable.length === 0) return evaluated[0] ?? { value: null, source: null, sourceType: "unknown", sourceLabel: "Unknown", retrievedAt: null, effectiveAt: null, expiresAt: null, sourceHash: null, methodology: null, methodologyVersion: null, confidence: "unknown", verificationState: "unknown", diagnostics: ["No evidence candidates."] };
  const values = new Set(usable.map((candidate) => JSON.stringify(candidate.value)));
  if (values.size > 1) return { ...usable[0], verificationState: "conflict", diagnostics: ["Conflicting evidence candidates; no winner selected."] };
  return usable.sort((a, b) => Date.parse(b.retrievedAt!) - Date.parse(a.retrievedAt!))[0];
}
export function evidenceHealthStatus(states: MIVerificationState[]): "healthy" | "degraded" {
  return states.length > 0 && !states.some((state) => state === "invalid" || state === "conflict" || state === "unknown") ? "healthy" : "degraded";
}
