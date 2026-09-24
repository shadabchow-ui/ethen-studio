// ── Cortex Ultra Synthesizer Runtime ──────────────────────────────────────
// Synthesizes only accepted claims. Excludes rejected/unsupported.
// Surfaces contested claims and limitations.
// Returns degraded/all-fail result when no accepted claims exist.

import type {
  CortexUltraWorkerResult,
  CortexUltraClaimAssessment,
  CortexUltraVerifierReport,
  CortexUltraSynthesizerOutput,
  CortexUltraSynthesizerInput,
  CortexUltraFinalVerificationHelper,
  CortexUltraFinalVerificationResult,
  CortexEvidenceItem,
} from "./types";
import type { VerifierStatus } from "../cortex/types";

function buildSynthesizedOutput(
  input: CortexUltraSynthesizerInput
): {
  output: string;
  evidenceUsed: string[];
  limitations: string[];
  excludedClaims: Array<{ claimId: string; workerId: string; reason: string }>;
} {
  const report = input.verifierReports[0];
  if (!report) {
    return {
      output: "No verifier report available.",
      evidenceUsed: [],
      limitations: ["no_verifier_report"],
      excludedClaims: [],
    };
  }

  if (report.acceptedClaims.length === 0) {
    return {
      output: "No accepted claims to synthesize. All claims were rejected, unsupported, or contested.",
      evidenceUsed: [],
      limitations: [
        "no_accepted_claims",
        ...report.rejectedClaims.map((c) => `rejected:${c.claimId}`),
      ],
      excludedClaims: [
        ...report.rejectedClaims.map((c) => ({ claimId: c.claimId, workerId: c.workerId, reason: "rejected_or_unsupported" })),
        ...report.contestedClaims.map((c) => ({ claimId: c.claimId, workerId: c.workerId, reason: "contested" })),
      ],
    };
  }

  const lines: string[] = [];

  lines.push(`## Result`);
  lines.push("");

  const workerClaims = new Map<string, CortexUltraClaimAssessment[]>();
  for (const claim of report.acceptedClaims) {
    const existing = workerClaims.get(claim.workerId) ?? [];
    existing.push(claim);
    workerClaims.set(claim.workerId, existing);
  }

  for (const [workerId, claims] of workerClaims) {
    const workerResult = input.workerResults.find((w) => w.workerId === workerId);
    lines.push(`### Worker: ${workerId}`);
    lines.push("");
    for (const claim of claims) {
      lines.push(`- **${claim.verdict.toUpperCase()}**: ${claim.claimId}`);
      const originalClaim = workerResult?.claims.find((c) => c.claimId === claim.claimId);
      if (originalClaim) {
        lines.push(`  - Type: ${originalClaim.type}`);
        lines.push(`  - Summary: ${originalClaim.summary}`);
        if (originalClaim.evidenceIds && originalClaim.evidenceIds.length > 0) {
          lines.push(`  - Evidence: ${originalClaim.evidenceIds.join(", ")}`);
        }
      }
      lines.push("");
    }
  }

  const evidenceUsed = report.acceptedClaims
    .flatMap((c) => c.evidenceIds)
    .filter((evidenceId) => input.evidenceIndex[evidenceId] !== undefined);
  const uniqueEvidence = [...new Set(evidenceUsed)];

  if (report.contestedClaims.length > 0) {
    lines.push("### Contested Claims");
    lines.push("");
    lines.push("The following claims were contested and excluded:");
    for (const c of report.contestedClaims) {
      lines.push(`- ${c.claimId} (${c.workerId})`);
    }
    lines.push("");
  }

  if (report.warnings.length > 0) {
    lines.push("### Warnings");
    lines.push("");
    for (const w of report.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  const limitations: string[] = [];
  if (report.contestedClaims.length > 0) limitations.push("contested_claims_excluded");
  if (report.warnings.length > 0) limitations.push("verifier_warnings_present");
  if (report.rejectedClaims.length > 0) limitations.push(`${report.rejectedClaims.length}_claims_rejected`);

  const excludedClaims = [
    ...report.rejectedClaims.map((c) => ({ claimId: c.claimId, workerId: c.workerId, reason: "rejected_or_unsupported" })),
    ...report.contestedClaims.map((c) => ({ claimId: c.claimId, workerId: c.workerId, reason: "contested" })),
  ];

  return {
    output: lines.join("\n"),
    evidenceUsed: uniqueEvidence,
    limitations,
    excludedClaims,
  };
}

export async function runUltraSynthesizer(
  input: CortexUltraSynthesizerInput,
  finalVerification?: CortexUltraFinalVerificationHelper
): Promise<CortexUltraSynthesizerOutput> {
  const { output, evidenceUsed, limitations, excludedClaims } = buildSynthesizedOutput(input);

  const hasAccepted = input.verifierReports.some((r) => r.acceptedClaims.length > 0);
  const status: CortexUltraSynthesizerOutput["status"] = hasAccepted ? "complete" : "degraded";

  let finalVerificationStatus: VerifierStatus = "pending";
  let finalVerificationWarnings: string[] = [];

  if (!finalVerification) {
    finalVerificationStatus = "skipped";
    finalVerificationWarnings = ["final_verification_unavailable"];
  } else {
    try {
      const result = await finalVerification(output);
      if (result) {
        finalVerificationStatus = result.status;
        finalVerificationWarnings = result.warnings ?? [];
      } else {
        finalVerificationStatus = "skipped";
        finalVerificationWarnings = ["final_verification_returned_no_result"];
      }
    } catch {
      finalVerificationStatus = "skipped";
      finalVerificationWarnings = ["final_verification_failed"];
    }
  }

  if (finalVerificationStatus !== "passed") limitations.push(`final_verification:${finalVerificationStatus}`);

  return {
    status,
    output,
    evidenceUsed,
    limitations,
    excludedClaims,
    finalVerificationStatus,
    finalVerificationWarnings,
  };
}
