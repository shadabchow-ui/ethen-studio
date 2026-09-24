/** Studio V5 workbench — memory stores for tests and local dev (STUDIO_14, server-only). */
import "server-only";
import { workbenchError } from "./types";
import type {
  CinemaScene,
  CinemaSequence,
  CinemaTake,
  EditorialShot,
  RenderSubmission,
  TimelineRevision,
} from "./types";
import { sameScope } from "../../contracts/scope";

/** CAS timeline store: revisions append; expected-parent mismatches go stale. */
export class MemoryTimelineStore {
  private readonly revisions = new Map<string, TimelineRevision[]>();

  head(timelineId: string): TimelineRevision | null {
    const list = this.revisions.get(timelineId);
    return list && list.length > 0 ? list[list.length - 1] : null;
  }

  get(timelineId: string, revision: number): TimelineRevision | null {
    return this.revisions.get(timelineId)?.find((r) => r.revision === revision) ?? null;
  }

  append(revision: TimelineRevision): TimelineRevision {
    const list = this.revisions.get(revision.timelineId) ?? [];
    const head = list.length > 0 ? list[list.length - 1] : null;
    if (head) {
      if (!sameScope(head.scope, revision.scope)) {
        throw workbenchError("FORBIDDEN", "Timeline revision scope mismatch.", { timelineId: revision.timelineId });
      }
      if (revision.parentRevision !== head.revision || revision.revision !== head.revision + 1) {
        throw workbenchError("STALE_REVISION", "Timeline head moved; reload and reapply the edit.", {
          timelineId: revision.timelineId,
          expectedParent: head.revision,
        });
      }
    } else if (revision.revision !== 1 || revision.parentRevision !== null) {
      throw workbenchError("BAD_REQUEST", "First timeline revision must be revision 1.", {
        timelineId: revision.timelineId,
      });
    }
    list.push(revision);
    this.revisions.set(revision.timelineId, list);
    return revision;
  }

  listHeads(): TimelineRevision[] {
    return [...this.revisions.values()].map((list) => list[list.length - 1]);
  }
}

/** Idempotent render store: same idempotency key replays the original submission. */
export class MemoryRenderStore {
  private readonly byKey = new Map<string, RenderSubmission>();
  private readonly byId = new Map<string, RenderSubmission>();

  submit(submission: RenderSubmission): { submission: RenderSubmission; replayed: boolean } {
    const existing = this.byKey.get(submission.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== submission.requestHash) {
        throw workbenchError("CONFLICT", "Idempotency key reuse with a different render payload.", {
          idempotencyKey: submission.idempotencyKey,
        });
      }
      return { submission: existing, replayed: true };
    }
    this.byKey.set(submission.idempotencyKey, submission);
    this.byId.set(submission.renderId, submission);
    return { submission, replayed: false };
  }

  get(renderId: string): RenderSubmission | null {
    return this.byId.get(renderId) ?? null;
  }
}

/** Scoped Cinema store: sequences, scenes, shots and takes by project. */
export class MemoryCinemaStore {
  private readonly sequences = new Map<string, CinemaSequence>();
  private readonly scenes = new Map<string, CinemaScene>();
  private readonly shots = new Map<string, EditorialShot>();
  private readonly takes = new Map<string, CinemaTake>();

  putSequence(sequence: CinemaSequence): void {
    this.sequences.set(sequence.sequenceId, sequence);
  }

  putScene(scene: CinemaScene): void {
    if (!this.sequences.has(scene.sequenceId)) {
      throw workbenchError("NOT_FOUND", "Scene sequence is not in this store.", { sequenceId: scene.sequenceId });
    }
    this.scenes.set(scene.sceneId, scene);
  }

  putShot(shot: EditorialShot): void {
    if (!this.scenes.has(shot.sceneId)) {
      throw workbenchError("NOT_FOUND", "Shot scene is not in this store.", { sceneId: shot.sceneId });
    }
    this.shots.set(shot.shotId, shot);
  }

  putTake(take: CinemaTake): void {
    this.takes.set(take.takeId, take);
  }

  getShot(shotId: string): EditorialShot | null {
    return this.shots.get(shotId) ?? null;
  }

  getTake(takeId: string): CinemaTake | null {
    return this.takes.get(takeId) ?? null;
  }

  scenesOf(sequenceId: string): CinemaScene[] {
    return [...this.scenes.values()]
      .filter((scene) => scene.sequenceId === sequenceId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  shotsOf(sceneId: string): EditorialShot[] {
    return [...this.shots.values()]
      .filter((shot) => shot.sceneId === sceneId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }
}
