/**
 * Studio V3 Job 2 — staged candidate adapters (schema-gated, never executable).
 *
 * Minimal descriptors for text-to-image, image-edit, text-to-video and
 * image-to-video. A candidate stages when at least one eligible endpoint for
 * its task has a verified input schema; schema support alone never marks it
 * executable — Job 3 supplies runtime/policy/health/credential checks.
 */

import type { StudioEndpoint } from "./endpoint-registry";

export type CandidateTask = "text-to-image" | "image-editing" | "text-to-video" | "image-to-video";

export interface CandidateAdapter {
  task: CandidateTask;
  staged: boolean;
  /** Eligible schema-supported endpoints backing this candidate. */
  endpoints: readonly string[];
  executable: false;
  executableReason: string;
  stageReason: string | null;
}

export const CANDIDATE_TASKS: readonly CandidateTask[] = [
  "text-to-image",
  "image-editing",
  "text-to-video",
  "image-to-video",
];

export function stageCandidates(endpoints: readonly StudioEndpoint[]): CandidateAdapter[] {
  return CANDIDATE_TASKS.map((task) => {
    const backing = endpoints
      .filter((e) => e.task === task && e.disposition === "eligible" && e.schema.status === "supported")
      .map((e) => e.endpointId)
      .sort();
    const staged = backing.length > 0;
    return {
      task,
      staged,
      endpoints: backing,
      executable: false,
      executableReason: "Job 3 gate: runtime, policy, health and credential checks not yet supplied",
      stageReason: staged
        ? `${backing.length} eligible schema-supported endpoint(s)`
        : "no eligible schema-supported endpoint for task",
    };
  });
}
