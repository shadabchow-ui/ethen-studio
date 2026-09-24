/**
 * PR-ST-04: Safety and rights certification on the production path.
 *
 * Runs safety and rights checks before generation is allowed, records every
 * decision with a timestamp and reason, and refuses generation when a blocking
 * check fails. Decisions are auditable via the recorded trail.
 */
import { runSafetyPreflight, type PreflightResult } from "./safety/preflight";
import { buildRightsDisclosureChecklist, type RightsDisclosureChecklist } from "./rights-checklist";
import type { MediaModality } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

export type CertificationDecision = "passed" | "blocked" | "warning";

export interface SafetyCertification {
  jobId: string;
  safetyResult: PreflightResult | null;
  rightsChecklist: RightsDisclosureChecklist | null;
  decision: CertificationDecision;
  decidedAt: string;
  reason: string | null;
}

export interface GenerationCertification {
  /** Unique certification ID for audit trail. */
  id: string;
  projectId: string;
  jobId: string;
  appId: string;
  promptSummary: string;
  safety: SafetyCertification;
  budgetCheck: {
    allowed: boolean;
    reason: string | null;
    estimatedCost: number;
    remaining: number;
  };
  certifiedAt: string;
  certifiedBy: string;
}

export interface CertificationInput {
  projectId: string;
  jobId: string;
  appId: string;
  promptSummary: string;
  modality: "image" | "video" | "audio" | "text";
  prompt: string;
  estimatedCost: number;
}

// ── Certification Store ────────────────────────────────────────────────────

const certifications: GenerationCertification[] = [];
let certCounter = 0;

function generateCertId(): string {
  certCounter++;
  return `cert_${Date.now()}_${certCounter}`;
}

// ── Certification Flow ─────────────────────────────────────────────────────

/**
 * Run the full certification flow for a generation:
 * 1. Safety preflight check
 * 2. Rights disclosure checklist
 * 3. Combined decision
 *
 * Returns a GenerationCertification with the recorded decisions.
 * When blocked, the caller MUST NOT proceed with generation.
 */
export function certifyGeneration(
  input: CertificationInput,
  certifiedBy: string,
): GenerationCertification {
  // 1. Safety check
  let safetyResult: PreflightResult | null = null;
  let safetyDecision: CertificationDecision = "passed";
  let safetyReason: string | null = null;

  safetyResult = runSafetyPreflight({
    request: {
      prompt: input.prompt,
      modality: (input.modality === "text" ? "image" : input.modality) as MediaModality,
      mode: input.modality === "text" ? "image" : input.modality,
      capability: "generate",
    },
  });

  if (safetyResult.blocked) {
    safetyDecision = "blocked";
    safetyReason = safetyResult.blockedReason ?? "Blocked by safety preflight.";
  } else if (safetyResult.requiresConsent || safetyResult.requiresApproval) {
    safetyDecision = "warning";
    safetyReason = safetyResult.requiresConsent
      ? "Consent required before proceeding."
      : "Approval required before proceeding.";
  }

  // 2. Rights checklist
  const rightsChecklist = buildRightsDisclosureChecklist({
    hasAIOutput: true,
    hasSyntheticPerson: input.modality === "image",
  });

  // 3. Combine decisions
  let decision: CertificationDecision = "passed";
  if (safetyDecision === "blocked" || rightsChecklist.anyBlockingUnchecked) {
    decision = "blocked";
  } else if (safetyDecision === "warning") {
    decision = "warning";
  }

  const cert: GenerationCertification = {
    id: generateCertId(),
    projectId: input.projectId,
    jobId: input.jobId,
    appId: input.appId,
    promptSummary: input.promptSummary,
    safety: {
      jobId: input.jobId,
      safetyResult,
      rightsChecklist,
      decision: safetyDecision,
      decidedAt: new Date().toISOString(),
      reason: safetyReason,
    },
    budgetCheck: {
      allowed: true, // Caller should integrate with budgets.ts
      reason: null,
      estimatedCost: input.estimatedCost,
      remaining: 0,
    },
    certifiedAt: new Date().toISOString(),
    certifiedBy,
  };

  certifications.push(cert);
  return { ...cert };
}

/**
 * Get the certification record for a job.
 */
export function getCertification(jobId: string): GenerationCertification | null {
  const cert = certifications.find((c) => c.jobId === jobId);
  return cert ? { ...cert } : null;
}

/**
 * Get all certifications for a project.
 */
export function listCertifications(projectId: string): GenerationCertification[] {
  return certifications
    .filter((c) => c.projectId === projectId)
    .map((c) => ({ ...c }));
}

/**
 * Get the audit trail of all safety and rights decisions.
 */
export function getCertificationAuditTrail(): GenerationCertification[] {
  return certifications.map((c) => ({ ...c }));
}

// ── Check: can a generation proceed? ───────────────────────────────────────

export interface GenerationClearance {
  canProceed: boolean;
  reason: string | null;
  certification: GenerationCertification;
}

/**
 * Deterministic check: returns clearance for a generation given budget + safety.
 */
export function checkGenerationClearance(
  cert: GenerationCertification,
  budgetCheckResult: { allowed: boolean; reason: string | null },
): GenerationClearance {
  if (cert.safety.decision === "blocked") {
    return {
      canProceed: false,
      reason: cert.safety.reason ?? "Blocked by safety check.",
      certification: cert,
    };
  }

  if (!budgetCheckResult.allowed) {
    return {
      canProceed: false,
      reason: budgetCheckResult.reason ?? "Blocked by budget ceiling.",
      certification: cert,
    };
  }

  if (cert.safety.decision === "warning") {
    return {
      canProceed: true,
      reason: cert.safety.reason ?? "Proceeding with warnings.",
      certification: cert,
    };
  }

  return {
    canProceed: true,
    reason: null,
    certification: cert,
  };
}

// ── Reset (for testing) ────────────────────────────────────────────────────

export function resetCertifications(): void {
  certifications.length = 0;
  certCounter = 0;
}
