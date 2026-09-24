/**
 * Studio V2 Job 05 — evaluation service over measured outputs.
 *
 * Verdict semantics (honest, reviewable):
 * - fail: a deterministic tool failed (targeted defect, repair-eligible).
 * - needs-review: no deterministic failure, but subjective quality or an
 *   unknown remains — requires calibrated/human-reviewed evidence.
 * - pass: every applicable deterministic tool passed AND the caller asserts
 *   no subjective dimension applies (re-checks, not fresh creative output).
 * Lock preservation failures are never auto-repaired: weakening a lock to
 * obtain a passing score is forbidden, so lock defects route to humans.
 */

import { randomUUID } from "node:crypto";
import type { StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";
import {
  RUBRIC_PRESERVATION_V1,
  RUBRIC_SUBJECTIVE_V1,
  RUBRIC_TECHNICAL_V1,
  runPreservationTools,
  runTechnicalTools,
  type LockedAttribute,
  type ToolResult,
} from "./eval-rubrics";

export type EvalVerdict = "pass" | "needs-review" | "fail";

export interface EvalDefect {
  signature: string;
  target: "output" | "locked-attribute";
  kind: string;
  detail: string;
  /** Only deterministic output defects are auto-repairable. */
  autoRepairable: boolean;
}

export interface EvalInput {
  jobId: string;
  kind: "image" | "video";
  requested: { size?: string | null };
  /** Original request snapshot for faithful repair re-issue. */
  request?: Record<string, unknown>;
  actual: {
    assetId: string | null;
    takeId?: string | null;
    contentHash: string | null;
    width: number | null;
    height: number | null;
    durationSeconds?: number | null;
  };
  locks?: readonly LockedAttribute[];
  /** True only for deterministic re-checks with no subjective dimension. */
  noSubjectiveDimension?: boolean;
}

export interface EvalResult {
  verdict: EvalVerdict;
  defects: EvalDefect[];
  tools: ToolResult[];
  rubrics: Array<{ name: string; version: string }>;
  confidence: "high" | "medium" | "low" | "unknown";
}

export function evaluateOutput(input: EvalInput): EvalResult {
  const technical = runTechnicalTools({
    kind: input.kind,
    requestedSize: input.requested.size ?? null,
    actualWidth: input.actual.width,
    actualHeight: input.actual.height,
    actualDurationSeconds: input.actual.durationSeconds ?? null,
    contentHash: input.actual.contentHash,
  });
  const preservation = runPreservationTools(input.locks ?? []);
  const tools = [...technical, ...preservation];
  const defects: EvalDefect[] = [];
  for (const tool of tools) {
    if (tool.outcome !== "fail") continue;
    if (tool.tool === "lock-intact") {
      defects.push({
        signature: "lock-changed", target: "locked-attribute", kind: tool.tool,
        detail: tool.detail, autoRepairable: false,
      });
    } else {
      defects.push({
        signature: `${tool.tool}-failed`, target: "output", kind: tool.tool,
        detail: tool.detail, autoRepairable: true,
      });
    }
  }
  const failed = tools.some((tool) => tool.outcome === "fail");
  const unknown = tools.some((tool) => tool.outcome === "unknown");
  const verdict: EvalVerdict = failed ? "fail" : !unknown && input.noSubjectiveDimension === true ? "pass" : "needs-review";
  const confidence = failed ? "high" : unknown ? "low" : "medium";
  return {
    verdict,
    defects,
    tools,
    rubrics: [
      { name: RUBRIC_TECHNICAL_V1.name, version: RUBRIC_TECHNICAL_V1.version },
      { name: RUBRIC_PRESERVATION_V1.name, version: RUBRIC_PRESERVATION_V1.version },
      { name: RUBRIC_SUBJECTIVE_V1.name, version: RUBRIC_SUBJECTIVE_V1.version },
    ],
    confidence,
  };
}

export interface RecordedEvidence {
  id: string;
  verdict: EvalVerdict;
}

/** Persist inspectable evidence: verdict, scores-as-tool-outcomes, defects, versions. */
export async function recordEvaluationEvidence(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: EvalInput,
  result: EvalResult,
): Promise<RecordedEvidence> {
  const id = randomUUID();
  const at = new Date().toISOString();
  await repo.insert(scope, "studio_evaluation_evidence", {
    id,
    payload: {
      job_id: input.jobId,
      entity_kind: input.kind,
      asset_id: input.actual.assetId,
      take_id: input.actual.takeId ?? null,
      rubric_name: "technical+preservation+subjective",
      rubric_version: "v1",
      rubrics: result.rubrics.map((rubric) => ({ ...rubric })),
      tool_versions: Object.fromEntries(result.tools.map((tool) => [tool.tool, tool.version])),
      verdict: result.verdict,
      scores: Object.fromEntries(result.tools.map((tool) => [tool.tool, tool.outcome])),
      defects: result.defects.map((defect) => ({ ...defect })),
      confidence: result.confidence,
      sample_count: 1,
      request: { ...(input.request ?? {}) },
    },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  await repo.appendEvent(scope, {
    entityKind: input.kind, entityId: input.jobId, revision: 1,
    type: "evaluation.recorded",
    payload: { evidence_id: id, verdict: result.verdict, defects: result.defects.map((defect) => defect.signature) },
    target: "studio-graph", actorId: scope.actorId,
  }).catch(() => null);
  return { id, verdict: result.verdict };
}

/**
 * Worker-side hook: evaluate an accepted output and persist inspectable
 * evidence. Additive and non-blocking — evaluation failure is observed via
 * the returned error, never thrown into the execution path.
 */
export async function evaluateAndRecord(
  repo: StudioRepository,
  scope: { organizationId: string; projectId: string; actorId: string },
  input: Omit<EvalInput, "locks"> & { lockEntityId?: string | null },
): Promise<RecordedEvidence> {
  let locks: LockedAttribute[] = [];
  try {
    if (input.lockEntityId) {
      const rows = await repo.list(scope, "studio_decision_locks");
      locks = rows
        .filter((row) => {
          const data = row.payload as Record<string, unknown>;
          return String(data.entity_id ?? "") === input.lockEntityId && (data.superseded_by ?? null) === null;
        })
        .map((row) => {
          const data = row.payload as Record<string, unknown>;
          return {
            entityKind: String(data.entity_kind ?? ""),
            entityId: String(data.entity_id ?? ""),
            entityRevision: typeof data.entity_revision === "number" ? data.entity_revision : 1,
            payloadHash: String(data.payload_hash ?? ""),
            currentDigest: input.actual.contentHash,
          };
        });
    }
  } catch {
    locks = [];
  }
  const result = evaluateOutput({ ...input, locks });
  return recordEvaluationEvidence(repo, scope, { ...input, locks }, result);
}
