/** Studio V5 workbench — Cinema sequence/scene/shot/take board (STUDIO_14, server-only). */
import "server-only";
import { randomUUID } from "node:crypto";
import { workbenchError } from "./types";
import type {
  CinemaScene,
  CinemaSequence,
  CinemaTake,
  EditorialEntity,
  EditorialShot,
  EditorialStatus,
  FrameRate,
} from "./types";
import type { ProjectScope } from "../../contracts/scope";
import { sameScope } from "../../contracts/scope";

export const EDITORIAL_STATUS_ORDER: readonly EditorialStatus[] = [
  "draft",
  "staged",
  "in_production",
  "review",
  "approved",
  "locked",
];

/** Forward-only status ladder (locked is terminal). Recovered from cinema.ts. */
export function transitionEditorialStatus(from: EditorialStatus, to: EditorialStatus): void {
  const fromIndex = EDITORIAL_STATUS_ORDER.indexOf(from);
  const toIndex = EDITORIAL_STATUS_ORDER.indexOf(to);
  if (fromIndex === -1 || toIndex === -1 || toIndex !== fromIndex + 1) {
    throw workbenchError("BAD_REQUEST", `Editorial transition ${from} -> ${to} must advance exactly one rung.`, {
      from,
      to,
    });
  }
}

function assertTitle(title: string, noun: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw workbenchError("BAD_REQUEST", `${noun} title is required.`, {});
  return trimmed;
}

function assertEntities(entities: EditorialEntity[] | undefined, noun: string): EditorialEntity[] {
  if (!entities) return [];
  for (const entity of entities) {
    if (!entity.key.trim()) throw workbenchError("BAD_REQUEST", `${noun} entity key is required.`, {});
  }
  return entities.map((e) => ({ ...e, key: e.key.trim() }));
}

/** Resolve effective shot entities: scene inherited unless the shot overrides the key. */
export function resolveShotEntities(scene: EditorialEntity[], shot: EditorialEntity[]): EditorialEntity[] {
  const merged = new Map<string, EditorialEntity>();
  for (const entity of scene) merged.set(entity.key, { ...entity });
  for (const entity of shot) merged.set(entity.key, { ...entity });
  return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function createCinemaSequence(input: {
  scope: ProjectScope;
  title: string;
  fps?: FrameRate;
}): CinemaSequence {
  const fps = input.fps ?? { num: 30, den: 1 };
  if (!Number.isInteger(fps.num) || !Number.isInteger(fps.den) || fps.num <= 0 || fps.den <= 0) {
    throw workbenchError("BAD_REQUEST", "Sequence frame rate must be a positive rational num/den.", {});
  }
  return {
    sequenceId: randomUUID(),
    scope: input.scope,
    title: assertTitle(input.title, "Sequence"),
    status: "draft",
    fps,
    revision: 1,
  };
}

export function createCinemaScene(input: {
  sequence: CinemaSequence;
  title: string;
  orderIndex: number;
  entities?: EditorialEntity[];
}): CinemaScene {
  if (!Number.isInteger(input.orderIndex) || input.orderIndex < 0) {
    throw workbenchError("BAD_REQUEST", "Scene orderIndex must be an integer >= 0.", {});
  }
  return {
    sceneId: randomUUID(),
    sequenceId: input.sequence.sequenceId,
    orderIndex: input.orderIndex,
    title: assertTitle(input.title, "Scene"),
    status: "draft",
    entities: assertEntities(input.entities, "Scene"),
    revision: 1,
  };
}

export function createEditorialShot(input: {
  scene: CinemaScene;
  title: string;
  orderIndex: number;
  entities?: EditorialEntity[];
}): EditorialShot {
  if (!Number.isInteger(input.orderIndex) || input.orderIndex < 0) {
    throw workbenchError("BAD_REQUEST", "Shot orderIndex must be an integer >= 0.", {});
  }
  return {
    shotId: randomUUID(),
    sceneId: input.scene.sceneId,
    orderIndex: input.orderIndex,
    title: assertTitle(input.title, "Shot"),
    status: "draft",
    entities: assertEntities(input.entities, "Shot"),
    linkedTakeIds: [],
    selectedTakeId: null,
    selectedTakeJobId: null,
    revision: 1,
  };
}

/**
 * Link a take to an editorial shot. The take must live in the same
 * project scope; its canonical generation JobId is recorded on the take
 * (never renamed) and surfaced on selection.
 */
export function linkTakeToShot(shot: EditorialShot, take: CinemaTake, shotScope: ProjectScope): EditorialShot {
  if (!sameScope(shotScope, take.scope)) {
    throw workbenchError("FORBIDDEN", "Take is not in this project.", { takeId: take.takeId });
  }
  if (take.status !== "accepted") {
    throw workbenchError("BAD_REQUEST", "Only accepted takes link to a shot.", { takeId: take.takeId });
  }
  if (shot.linkedTakeIds.includes(take.takeId)) return shot;
  return { ...shot, linkedTakeIds: [...shot.linkedTakeIds, take.takeId], revision: shot.revision + 1 };
}

/**
 * Pin the selected take for the timeline. Records BOTH the editorial
 * take id and the canonical JobId — the renamed binding that replaces
 * the ambiguous legacy shot-job field without changing the external id.
 */
export function selectShotTake(shot: EditorialShot, take: CinemaTake): EditorialShot {
  if (!shot.linkedTakeIds.includes(take.takeId)) {
    throw workbenchError("BAD_REQUEST", "Take is not linked to this shot; link it first.", {
      shotId: shot.shotId,
      takeId: take.takeId,
    });
  }
  return { ...shot, selectedTakeId: take.takeId, selectedTakeJobId: take.jobId, revision: shot.revision + 1 };
}

export interface ShotTimelineEntry {
  shotId: string;
  title: string;
  orderIndex: number;
  takeId: string | null;
  /** Canonical JobId of the selected take, or null when nothing is selected. */
  takeJobId: string | null;
  /** Measured take duration in integer ticks, or null when unmeasured — never estimated. */
  durationTicks: number | null;
}

export interface SceneTimelineEntry {
  sceneId: string;
  title: string;
  orderIndex: number;
  shots: ShotTimelineEntry[];
  /** Sum of measured shot durations only. */
  sceneDurationTicks: number;
}

/**
 * Project a Cinema timeline from selected takes with measured durations.
 * Shots without a selected measured take list null duration — never estimated.
 */
export function projectCinemaTimeline(input: {
  scenes: CinemaScene[];
  shots: EditorialShot[];
  takeDurationsTicks: ReadonlyMap<string, number | null>;
}): SceneTimelineEntry[] {
  const ordered = [...input.scenes].sort((a, b) => a.orderIndex - b.orderIndex);
  return ordered.map((scene) => {
    const shots = input.shots
      .filter((shot) => shot.sceneId === scene.sceneId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((shot): ShotTimelineEntry => {
        const durationTicks = shot.selectedTakeId ? (input.takeDurationsTicks.get(shot.selectedTakeId) ?? null) : null;
        return {
          shotId: shot.shotId,
          title: shot.title,
          orderIndex: shot.orderIndex,
          takeId: shot.selectedTakeId,
          takeJobId: shot.selectedTakeJobId,
          durationTicks,
        };
      });
    return {
      sceneId: scene.sceneId,
      title: scene.title,
      orderIndex: scene.orderIndex,
      shots,
      sceneDurationTicks: shots.reduce((sum, shot) => sum + (shot.durationTicks ?? 0), 0),
    };
  });
}
