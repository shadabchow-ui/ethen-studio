/**
 * Studio V2 Job 09 — continuity evaluation across selected takes.
 * Compares consecutive selected takes in scene order on measured facts
 * only: dimension stability, known durations, and entity-state reference
 * resolution. Findings persist as evaluation evidence with rubric
 * continuity/v1; unknown stays unknown, never a passing score.
 */

import { randomUUID } from "node:crypto";
import type { StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";
import { projectTimeline, resolveEntityState, parseEntityState, type SequenceTimeline } from "./cinema";

export interface ContinuityFinding {
  signature: string;
  between: [string, string];
  kind: string;
  detail: string;
}

export interface ContinuityResult {
  verdict: "pass" | "needs-review" | "fail";
  findings: ContinuityFinding[];
  pairsChecked: number;
  rubrics: Array<{ name: string; version: string }>;
}

export const CONTINUITY_RUBRIC = Object.freeze({ name: "continuity", version: "v1" });

/** Evaluate continuity over a projected timeline. Pure. */
export function evaluateContinuity(timeline: SequenceTimeline): ContinuityResult {
  const findings: ContinuityFinding[] = [];
  let pairsChecked = 0;
  for (const scene of timeline.scenes) {
    const measured = scene.shots.filter((shot) => shot.takeId !== null);
    for (let index = 1; index < measured.length; index += 1) {
      const prev = measured[index - 1] as (typeof measured)[number];
      const next = measured[index] as (typeof measured)[number];
      pairsChecked += 1;
      const pair: [string, string] = [prev.shotId, next.shotId];
      if (prev.width !== null && next.width !== null && (prev.width !== next.width || prev.height !== next.height)) {
        findings.push({
          signature: "continuity-dims-changed", between: pair, kind: "dims-match",
          detail: `${prev.width}x${prev.height} -> ${next.width}x${next.height}`,
        });
      }
      if (prev.durationSeconds === null || next.durationSeconds === null) {
        findings.push({
          signature: "continuity-duration-unknown", between: pair, kind: "duration-known",
          detail: "a take in this pair has no measured duration",
        });
      }
      if (prev.contentHash !== null && prev.contentHash === next.contentHash) {
        findings.push({
          signature: "continuity-duplicate-take", between: pair, kind: "take-unique",
          detail: "consecutive shots selected the same bytes",
        });
      }
    }
  }
  const failed = findings.some((finding) => finding.signature === "continuity-dims-changed");
  const verdict = failed ? "fail" : findings.length > 0 ? "needs-review" : "pass";
  return { verdict, findings, pairsChecked, rubrics: [{ ...CONTINUITY_RUBRIC }] };
}

export interface ContinuityEvidence {
  id: string;
  verdict: ContinuityResult["verdict"];
}

/**
 * Evaluate a scene's continuity and persist inspectable evidence.
 * Entity references resolve through scene/shot inheritance: unresolved
 * entity refs are reported, never assumed continuous.
 */
export async function evaluateSceneContinuity(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  sequenceId: string,
  sceneId: string,
): Promise<ContinuityEvidence & { result: ContinuityResult }> {
  const timeline = await projectTimeline(repo, scope, sequenceId);
  const scene = timeline.scenes.find((entry) => entry.sceneId === sceneId);
  if (!scene) throw new Error("CINEMA_NOT_FOUND: scene is not in this sequence.");
  const sceneRow = await repo.get(scope, "studio_scenes", sceneId);
  const shotRows = await repo.list(scope, "studio_shots");
  const sceneState = parseEntityState((sceneRow?.payload as Record<string, unknown> | undefined)?.entity_state);
  const unresolved: ContinuityFinding[] = [];
  for (const shot of scene.shots) {
    const shotRow = shotRows.find((row) => row.id === shot.shotId);
    const shotState = parseEntityState(shotRow ? (shotRow.payload as Record<string, unknown>).entity_state : null);
    for (const entity of resolveEntityState(sceneState, shotState)) {
      if (entity.refId === null) {
        unresolved.push({
          signature: "continuity-entity-unresolved", between: [shot.shotId, shot.shotId],
          kind: "entity-resolved", detail: `entity ${entity.key} has no reference`,
        });
      }
    }
  }
  const measured = evaluateContinuity({ ...timeline, scenes: [scene] });
  const findings = [...measured.findings, ...unresolved];
  const failed = findings.some((finding) => finding.signature === "continuity-dims-changed");
  const verdict = failed ? "fail" : findings.length > 0 ? "needs-review" : measured.verdict;
  const result: ContinuityResult = { verdict, findings, pairsChecked: measured.pairsChecked, rubrics: [{ ...CONTINUITY_RUBRIC }] };
  const id = randomUUID();
  const at = new Date().toISOString();
  await repo.insert(scope, "studio_evaluation_evidence", {
    id,
    payload: {
      job_id: scene.shots.find((shot) => shot.takeId !== null)?.takeId ?? sceneId,
      entity_kind: "scene",
      asset_id: null,
      take_id: null,
      rubric_name: "continuity",
      rubric_version: "v1",
      rubrics: [{ ...CONTINUITY_RUBRIC }],
      tool_versions: { "continuity-check": "v1" },
      verdict,
      scores: { continuity: verdict },
      defects: findings.map((finding) => ({ signature: finding.signature, target: "output", kind: finding.kind, detail: finding.detail, autoRepairable: false })),
      confidence: failed ? "high" : findings.length > 0 ? "low" : "medium",
      sample_count: measured.pairsChecked,
      request: { sequenceId, sceneId },
    },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  return { id, verdict, result };
}
