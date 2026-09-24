import "server-only";

/**
 * P04 — fixture-lane workbench repository (RC-3 workbench + cinema).
 *
 * Mirrors the `supabase-workbench.ts` shapes the routes consume, backed
 * by `localStores().workbench` (the kernel memory stores, never a
 * rewrite). Routes branch onto these functions only when
 * `isStudioFixtureLane()` holds. Validation stays in the kernel
 * (createTimelineRevision / applyEditOp / buildRenderSubmission /
 * createCinemaSequence); this lane only stores and projects rows.
 */
import type { ProjectScope } from "@ethen/studio-core/contracts";
import { sameScope } from "@ethen/studio-core/contracts";
import {
  WorkbenchError,
  type CinemaSequence,
  type RenderSubmission,
  type TimelineRevision,
} from "@ethen/studio-core/server/workbench";
import type {
  EditorialSceneRow,
  EditorialSequenceRow,
  EditorialShotRow,
  RenderRow,
  RevisionRow,
  TimelineHeadRow,
  TimelineRow,
} from "./supabase-workbench";
import type { LocalWorkbenchStores } from "./local-lane";

/** Minimal scope the lane needs (routes pass their ResolvedScope). */
export interface FixtureScope {
  scope: ProjectScope;
  tenantId: string;
  projectId: string;
}

// ------------------------------------------------------------------ timelines

function toHeadRow(revision: TimelineRevision): TimelineHeadRow {
  return {
    timelineId: revision.timelineId,
    title: revision.title,
    timescale: revision.timebase.timescale,
    fpsNum: revision.fps.num,
    fpsDen: revision.fps.den,
    headRevision: revision.revision,
    lockedBy: revision.lockedBy,
    updatedAt: revision.createdAt,
  };
}

function toTimelineRow(scope: FixtureScope, revision: TimelineRevision): TimelineRow {
  return {
    ...toHeadRow(revision),
    tenantId: scope.tenantId,
    projectId: scope.projectId,
  };
}

function toRevisionRow(revision: TimelineRevision): RevisionRow {
  return {
    revision: revision.revision,
    revisionId: revision.revisionId,
    parentRevision: revision.parentRevision,
    recipe: { tracks: revision.tracks, captionTracks: revision.captionTracks },
    recipeHash: revision.hash,
    createdAt: revision.createdAt,
  };
}

/** Newest-first heads for this project (empty until timelines are created). */
export function fixtureListTimelineHeads(
  stores: LocalWorkbenchStores,
  scope: FixtureScope,
): TimelineHeadRow[] {
  return stores.timelines
    .listHeads()
    .filter((head) => sameScope(head.scope, scope.scope))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toHeadRow);
}

export function fixtureGetTimelineHead(
  stores: LocalWorkbenchStores,
  scope: FixtureScope,
  timelineId: string,
): TimelineRow | null {
  const head = stores.timelines.head(timelineId);
  if (!head || !sameScope(head.scope, scope.scope)) return null;
  return toTimelineRow(scope, head);
}

export function fixtureGetTimelineRevision(
  stores: LocalWorkbenchStores,
  scope: FixtureScope,
  timelineId: string,
  revision: number,
): RevisionRow | null {
  const stored = stores.timelines.get(timelineId, revision);
  if (!stored || !sameScope(stored.scope, scope.scope)) return null;
  return toRevisionRow(stored);
}

/** Append a kernel-built revision (CAS lives in the memory store). */
export function fixtureAppendTimelineRevision(
  stores: LocalWorkbenchStores,
  scope: FixtureScope,
  revision: TimelineRevision,
): RevisionRow {
  if (!sameScope(revision.scope, scope.scope)) {
    throw new WorkbenchError("FORBIDDEN", "Timeline revision scope mismatch.", {
      timelineId: revision.timelineId,
    });
  }
  return toRevisionRow(stores.timelines.append(revision));
}

// -------------------------------------------------------------------- renders

function toRenderRow(submission: RenderSubmission): RenderRow {
  return {
    renderId: submission.renderId,
    timelineId: submission.spec.timelineId,
    revision: submission.spec.revision,
    revisionHash: submission.spec.revisionHash,
    spec: { output: submission.spec.output, interchange: submission.spec.interchange },
    idempotencyKey: submission.idempotencyKey,
    requestHash: submission.requestHash,
    status: submission.status,
    createdAt: submission.createdAt,
  };
}

/**
 * Record a kernel-built render submission (idempotent replay, same-key
 * mismatch is a CONFLICT). Records only — the fixture lane never calls
 * a renderer; execution stays with the worker (SETUP_REQUIRED).
 */
export function fixtureSubmitRender(
  stores: LocalWorkbenchStores,
  submission: RenderSubmission,
): { render: RenderRow; replayed: boolean } {
  const { submission: stored, replayed } = stores.renders.submit(submission);
  return { render: toRenderRow(stored), replayed };
}

// --------------------------------------------------------------------- cinema

function toSequenceRow(sequence: CinemaSequence): EditorialSequenceRow {
  return {
    sequenceId: sequence.sequenceId,
    title: sequence.title,
    status: sequence.status,
    fpsNum: sequence.fps.num,
    fpsDen: sequence.fps.den,
    revision: sequence.revision,
  };
}

export function fixtureListSequences(
  stores: LocalWorkbenchStores,
  scope: FixtureScope,
): EditorialSequenceRow[] {
  return [...stores.cinemaOrder]
    .reverse()
    .map((id) => stores.cinemaSequences.get(id))
    .filter((row): row is CinemaSequence => Boolean(row) && sameScope((row as CinemaSequence).scope, scope.scope))
    .map(toSequenceRow);
}

export function fixtureInsertSequence(
  stores: LocalWorkbenchStores,
  scope: FixtureScope,
  sequence: CinemaSequence,
): EditorialSequenceRow {
  if (!sameScope(sequence.scope, scope.scope)) {
    throw new WorkbenchError("FORBIDDEN", "Sequence scope mismatch.", { sequenceId: sequence.sequenceId });
  }
  stores.cinema.putSequence(sequence);
  stores.cinemaSequences.set(sequence.sequenceId, sequence);
  stores.cinemaOrder.push(sequence.sequenceId);
  return toSequenceRow(sequence);
}

export function fixtureGetSequenceDetail(
  stores: LocalWorkbenchStores,
  scope: FixtureScope,
  sequenceId: string,
): { sequence: EditorialSequenceRow; scenes: EditorialSceneRow[]; shots: EditorialShotRow[] } | null {
  const sequence = stores.cinemaSequences.get(sequenceId);
  if (!sequence || !sameScope(sequence.scope, scope.scope)) return null;
  const scenes = stores.cinema.scenesOf(sequenceId);
  const shots = scenes.flatMap((scene) => stores.cinema.shotsOf(scene.sceneId));
  return {
    sequence: toSequenceRow(sequence),
    scenes: scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sequenceId: scene.sequenceId,
      orderIndex: scene.orderIndex,
      title: scene.title,
      status: scene.status,
    })),
    shots: shots.map((shot) => ({
      shotId: shot.shotId,
      sceneId: shot.sceneId,
      orderIndex: shot.orderIndex,
      title: shot.title,
      status: shot.status,
      selectedTakeId: shot.selectedTakeId,
      selectedTakeJobId: shot.selectedTakeJobId,
    })),
  };
}
