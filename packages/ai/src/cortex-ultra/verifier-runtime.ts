// ── Cortex Ultra Verifier Runtime ────────────────────────────────────────
// Runs deterministic checks before optional judge call.
// Requires evidence refs for factual/tool claims. Rejects unsupported claims.
// Verdicts: pass | pass_with_warnings | fail | needs_human_review

import type {
  CortexUltraWorkerResult,
  CortexUltraWorkerClaim,
  CortexUltraClaimAssessment,
  CortexUltraClaimVerdict,
  CortexUltraVerifierVerdict,
  CortexUltraVerifierReport,
  CortexUltraVerifierOptions,
  CortexUltraVerifierJudge,
  CortexUltraVerifierJudgeInput,
  CortexUltraVerifierJudgeOutput,
  CortexEvidenceItem,
} from "./types";
import type { VerifierStatus } from "../cortex/types";

const EVIDENCE_REQUIRED_TYPES = new Set<CortexUltraWorkerClaim["type"]>([
  "factual",
  "tool_result",
]);

function assessClaim(
  claim: CortexUltraWorkerClaim,
  workerId: string,
  evidenceIndex: Record<string, CortexEvidenceItem>
): CortexUltraClaimAssessment {
  const reasons: string[] = [];
  const verdict: CortexUltraClaimVerdict = "accepted";

  // Empty or missing summary
  if (!claim.summary || claim.summary.trim().length === 0) {
    return {
      claimId: claim.claimId,
      workerId,
      verdict: "malformed",
      reasons: ["empty_or_missing_summary"],
      evidenceIds: claim.evidenceIds ?? [],
      canonicalKey: claim.canonicalKey,
    };
  }

  // Factual/tool_result claims must have evidence
  if (EVIDENCE_REQUIRED_TYPES.has(claim.type)) {
    const evidenceIds = claim.evidenceIds ?? [];
    if (evidenceIds.length === 0) {
      return {
        claimId: claim.claimId,
        workerId,
        verdict: "unsupported",
        reasons: [`${claim.type} claim missing evidence reference`],
        evidenceIds: [],
        canonicalKey: claim.canonicalKey,
      };
    }

    const hasValidEvidence = evidenceIds.some((id) => evidenceIndex[id] !== undefined);
    if (!hasValidEvidence) {
      return {
        claimId: claim.claimId,
        workerId,
        verdict: "unsupported",
        reasons: ["no_evidence_items_found_in_ledger"],
        evidenceIds,
        canonicalKey: claim.canonicalKey,
      };
    }
  }

  // Analysis/recommendation claims with no evidence get warnings
  if ((claim.type === "analysis" || claim.type === "recommendation") && (!claim.evidenceIds || claim.evidenceIds.length === 0)) {
    reasons.push("analysis_or_recommendation_claim_unbacked");
  }

  return { claimId: claim.claimId, workerId, verdict, reasons, evidenceIds: claim.evidenceIds ?? [], canonicalKey: claim.canonicalKey };
}

function detectContested(
  assessments: CortexUltraClaimAssessment[]
): CortexUltraClaimAssessment[] {
  const canonicalMap = new Map<string, CortexUltraClaimAssessment[]>();
  for (const a of assessments) {
    if (a.verdict === "accepted" && a.canonicalKey) {
      const existing = canonicalMap.get(a.canonicalKey) ?? [];
      existing.push(a);
      canonicalMap.set(a.canonicalKey, existing);
    }
  }
  const contestedIds = new Set<string>();
  for (const [, group] of canonicalMap) {
    if (group.length > 1) {
      for (const a of group) contestedIds.add(a.claimId);
    }
  }
  return assessments.map((a) =>
    contestedIds.has(a.claimId)
      ? { ...a, verdict: "contested" as CortexUltraClaimVerdict, reasons: [...a.reasons, "contested_by_another_worker"] }
      : a
  );
}

function computeDeterministicVerdict(
  assessments: CortexUltraClaimAssessment[],
  workerResults: CortexUltraWorkerResult[]
): { provisionalVerdict: CortexUltraVerifierVerdict; status: VerifierStatus; warnings: string[] } {
  const warnings: string[] = [];
  const total = assessments.length;
  if (total === 0) {
    return { provisionalVerdict: "needs_human_review", status: "failed", warnings: ["no_claims_to_assess"] };
  }

  const accepted = assessments.filter((a) => a.verdict === "accepted").length;
  const contested = assessments.filter((a) => a.verdict === "contested").length;
  const rejected = assessments.filter((a) => a.verdict === "rejected").length;
  const unsupported = assessments.filter((a) => a.verdict === "unsupported").length;
  const malformed = assessments.filter((a) => a.verdict === "malformed").length;

  if (malformed === total) return { provisionalVerdict: "fail", status: "failed", warnings: ["all_claims_malformed"] };

  const hasWarnings = assessments.some((a) => a.reasons.length > 0 && a.verdict === "accepted");

  if (rejected + unsupported + malformed > accepted + contested) {
    return { provisionalVerdict: "fail", status: "failed", warnings: [...warnings, "majority_claims_rejected_or_unsupported"] };
  }

  if (rejected + unsupported === total) {
    return { provisionalVerdict: "fail", status: "failed", warnings: ["all_claims_rejected_or_unsupported"] };
  }

  if (contested > 0 && accepted === 0) {
    return { provisionalVerdict: "needs_human_review", status: "warned", warnings: [...warnings, "only_contested_claims"] };
  }

  if (contested > 0 || unsupported > 0 || hasWarnings) {
    return { provisionalVerdict: "pass_with_warnings", status: "warned", warnings };
  }

  return { provisionalVerdict: "pass", status: "passed", warnings: [] };
}

export async function runUltraVerifier(
  task: string,
  workerResults: CortexUltraWorkerResult[],
  options: CortexUltraVerifierOptions
): Promise<CortexUltraVerifierReport> {
  const allAssessments: CortexUltraClaimAssessment[] = [];

  for (const wr of workerResults) {
    for (const claim of wr.claims) {
      allAssessments.push(assessClaim(claim, wr.workerId, options.evidenceIndex));
    }
  }

  const withContested = detectContested(allAssessments);

  const { provisionalVerdict, status: provStatus, warnings } = computeDeterministicVerdict(withContested, workerResults);

  let finalAssessments = withContested;
  let finalVerdict = provisionalVerdict;
  let finalStatus: VerifierStatus = provStatus;
  let judgeUsed = false;
  const additionalWarnings = [...warnings];

  if (options.judge) {
    const judgeInput: CortexUltraVerifierJudgeInput = {
      task,
      workerResults,
      provisionalVerdict,
      claimAssessments: withContested,
    };

    try {
      const judgeOutput = await options.judge(judgeInput);

      if (judgeOutput) {
        judgeUsed = true;
        if (judgeOutput.verdict) finalVerdict = judgeOutput.verdict;
        if (judgeOutput.status) finalStatus = judgeOutput.status;
        if (judgeOutput.warnings) additionalWarnings.push(...judgeOutput.warnings);

        if (judgeOutput.claimOverrides) {
          finalAssessments = withContested.map((a) => {
            const override = judgeOutput.claimOverrides?.find(
              (o) => o.claimId === a.claimId && o.workerId === a.workerId
            );
            if (override) {
              return {
                ...a,
                verdict: override.verdict,
                reasons: override.reasons ?? a.reasons,
              };
            }
            return a;
          });
        }
      }
    } catch {
      additionalWarnings.push("judge_call_failed_using_deterministic_verdict");
    }
  }

  const accepted = finalAssessments.filter((a) => a.verdict === "accepted");
  const rejected = finalAssessments.filter((a) => a.verdict === "rejected" || a.verdict === "unsupported");
  const contested = finalAssessments.filter((a) => a.verdict === "contested");
  const malformed = finalAssessments.filter((a) => a.verdict === "malformed");

  return {
    task,
    status: finalStatus,
    verdict: finalVerdict,
    acceptedClaims: accepted,
    rejectedClaims: rejected,
    contestedClaims: contested,
    malformedWorkers: malformed.length > 0 ? [{ workerId: workerResults[0]?.workerId ?? "unknown", reasons: malformed.map((m) => m.reasons.join(", ")) }] : [],
    warnings: additionalWarnings,
    requiredRepairs: finalVerdict === "fail" || finalVerdict === "needs_human_review"
      ? [{ action: "request_human_review", detail: "verifier_verdict_requires_review" }]
      : [],
    judgeUsed,
  };
}
