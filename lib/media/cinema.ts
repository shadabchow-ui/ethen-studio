/**
 * Studio V2 Job 09 — cinema continuity layer.
 * Sequences, scenes, and shots organize canonical takes and assets BY
 * REFERENCE: no creative bytes live here. EntityState tracks continuity
 * subjects (identity, wardrobe, lighting, props) with scene-to-shot
 * inheritance; transitions are guarded; take selection pins one accepted
 * take per shot; continuity evaluation compares consecutive selected takes.
 */

import { randomUUID } from "node:crypto";
import type { StudioPersistenceRecord, StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";

export type CinemaStatus = "draft" | "staged" | "in_production" | "review" | "approved" | "locked";
export type SceneStatus = "draft" | "staged" | "in_production" | "review" | "approved" | "locked";

const STATUS_ORDER: readonly string[] = ["draft", "staged", "in_production", "review", "approved", "locked"];

/** Forward-only status ladder (locked is terminal); regressions go through new revisions elsewhere. */
export function transitionCinemaStatus(from: string, to: string): void {
  const fromIndex = STATUS_ORDER.indexOf(from);
  const toIndex = STATUS_ORDER.indexOf(to);
  if (fromIndex === -1 || toIndex === -1 || toIndex !== fromIndex + 1) {
    throw new Error(`CINEMA_TRANSITION: ${from} -> ${to} must advance exactly one rung.`);
  }
}

export interface ContinuityEntity {
  key: string;
  kind: string;
  refId: string | null;
  attributesHash: string | null;
  source: "scene" | "shot";
}

export interface EntityState {
  entities: ContinuityEntity[];
}

/** Resolve effective shot state: scene entities inherited unless the shot overrides the key. */
export function resolveEntityState(scene: EntityState, shot: EntityState): ContinuityEntity[] {
  const merged = new Map<string, ContinuityEntity>();
  for (const entity of scene.entities ?? []) {
    if (entity.key) merged.set(entity.key, { ...entity, source: "scene" });
  }
  for (const entity of shot.entities ?? []) {
    if (entity.key) merged.set(entity.key, { ...entity, source: "shot" });
  }
  return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function parseEntityState(value: unknown): EntityState {
  if (typeof value !== "object" || value === null) return { entities: [] };
  const entities = (value as { entities?: unknown }).entities;
  if (!Array.isArray(entities)) return { entities: [] };
  return {
    entities: entities
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
      .filter((entry) => typeof entry.key === "string" && entry.key.length > 0)
      .map((entry) => ({
        key: entry.key as string,
        kind: typeof entry.kind === "string" ? entry.kind : "unknown",
        refId: typeof entry.refId === "string" ? entry.refId : null,
        attributesHash: typeof entry.attributesHash === "string" ? entry.attributesHash : null,
        source: "shot" as const,
      })),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function payloadOf(row: StudioPersistenceRecord): Record<string, unknown> {
  return row.payload as Record<string, unknown>;
}

function idempotencyKey(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function createSequence(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: { title: string; fps?: number; idempotencyKey?: string },
): Promise<string> {
  if (!input.title?.trim()) throw new Error("CINEMA_INVALID: sequence title is required.");
  const fps = input.fps ?? 30;
  if (![24, 25, 30, 60].includes(fps)) throw new Error("CINEMA_INVALID: fps must be 24, 25, 30, or 60.");
  const key = input.idempotencyKey?.trim() || idempotencyKey("seq");
  assertKey(key);
  const existing = await findByKey(repo, scope, "studio_sequences", key);
  if (existing) return existing;
  const id = randomUUID();
  const at = nowIso();
  await repo.insert(scope, "studio_sequences", {
    id,
    payload: { title: input.title.trim(), status: "draft", revision: 1, fps, idempotency_key: key },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
  return id;
}

export async function createScene(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: { sequenceId: string; title: string; orderIndex?: number; entities?: ContinuityEntity[]; idempotencyKey?: string },
): Promise<string> {
  const sequence = await repo.get(scope, "studio_sequences", input.sequenceId);
  if (!sequence) throw new Error("CINEMA_NOT_FOUND: sequence is not in this project.");
  if (!input.title?.trim()) throw new Error("CINEMA_INVALID: scene title is required.");
  const key = input.idempotencyKey?.trim() || idempotencyKey("scn");
  assertKey(key);
  const existing = await findByKey(repo, scope, "studio_scenes", key);
  if (existing) return existing;
  const siblings = await repo.list(scope, "studio_scenes");
  const orderIndex = input.orderIndex ?? siblings.filter((row) => String(payloadOf(row).sequence_id ?? "") === input.sequenceId).length;
  const id = randomUUID();
  const at = nowIso();
  await repo.insert(scope, "studio_scenes", {
    id,
    payload: {
      sequence_id: input.sequenceId, order_index: orderIndex, title: input.title.trim(),
      status: "draft", revision: 1, entity_state: { entities: [...(input.entities ?? [])] }, idempotency_key: key,
    },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
  return id;
}

export async function createShot(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: { sceneId: string; title: string; orderIndex?: number; entities?: ContinuityEntity[]; idempotencyKey?: string },
): Promise<string> {
  const scene = await repo.get(scope, "studio_scenes", input.sceneId);
  if (!scene) throw new Error("CINEMA_NOT_FOUND: scene is not in this project.");
  if (!input.title?.trim()) throw new Error("CINEMA_INVALID: shot title is required.");
  const key = input.idempotencyKey?.trim() || idempotencyKey("shot");
  assertKey(key);
  const existing = await findByKey(repo, scope, "studio_shots", key);
  if (existing) return existing;
  const siblings = await repo.list(scope, "studio_shots");
  const orderIndex = input.orderIndex ?? siblings.filter((row) => String(payloadOf(row).scene_id ?? "") === input.sceneId).length;
  const id = randomUUID();
  const at = nowIso();
  await repo.insert(scope, "studio_shots", {
    id,
    payload: {
      scene_id: input.sceneId, order_index: orderIndex, title: input.title.trim(),
      status: "draft", revision: 1, entity_state: { entities: [...(input.entities ?? [])] },
      linked_take_ids: [], selected_take_id: null, idempotency_key: key,
    },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
  return id;
}

function assertKey(key: string): void {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new Error("CINEMA_INVALID: idempotency key must be 8-128 chars.");
}

async function findByKey(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  table: "studio_sequences" | "studio_scenes" | "studio_shots" | "studio_campaigns" | "studio_workflows",
  key: string,
): Promise<string | null> {
  const rows = await repo.list(scope, table);
  const match = rows.find((row) => ((row.payload as Record<string, unknown>).idempotency_key as string) === key);
  return match ? match.id : null;
}

/** Link a take to a shot (verified same-project take); selection pins one take for the timeline. */
export async function linkTakeToShot(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  shotId: string,
  takeId: string,
  takeJobId: string,
): Promise<void> {
  const shot = await repo.get(scope, "studio_shots", shotId);
  if (!shot) throw new Error("CINEMA_NOT_FOUND: shot is not in this project.");
  const take = await repo.get(scope, "studio_takes", takeId).catch(() => null);
  if (!take) throw new Error("CINEMA_NOT_FOUND: take is not in this project.");
  const data = payloadOf(shot);
  const linked = [...((data.linked_take_ids ?? []) as string[])];
  if (!linked.includes(takeId)) linked.push(takeId);
  await repo.updateIfRevision(scope, "studio_shots", shotId, revisionOf(shot), {
    linked_take_ids: linked,
  });
  void takeJobId;
}

export async function selectShotTake(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  shotId: string,
  takeId: string,
): Promise<void> {
  const shot = await repo.get(scope, "studio_shots", shotId);
  if (!shot) throw new Error("CINEMA_NOT_FOUND: shot is not in this project.");
  const data = payloadOf(shot);
  const linked = (data.linked_take_ids ?? []) as string[];
  if (!linked.includes(takeId)) throw new Error("CINEMA_INVALID: take is not linked to this shot; link it first.");
  await repo.updateIfRevision(scope, "studio_shots", shotId, revisionOf(shot), { selected_take_id: takeId });
}

function revisionOf(row: StudioPersistenceRecord): number {
  const revision = payloadOf(row).revision;
  return typeof revision === "number" ? revision : 1;
}

export interface TimelineShot {
  shotId: string;
  title: string;
  orderIndex: number;
  takeId: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  contentHash: string | null;
  objectKey: string;
}

export interface TimelineScene {
  sceneId: string;
  title: string;
  orderIndex: number;
  shots: TimelineShot[];
  sceneDurationSeconds: number;
}

export interface SequenceTimeline {
  sequenceId: string;
  title: string;
  fps: number;
  scenes: TimelineScene[];
  totalDurationSeconds: number;
}

/**
 * Project a basic timeline from selected takes with measured durations.
 * Shots without a selected measured take are listed with null duration —
 * never estimated.
 */
export async function projectTimeline(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  sequenceId: string,
): Promise<SequenceTimeline> {
  const sequence = await repo.get(scope, "studio_sequences", sequenceId);
  if (!sequence) throw new Error("CINEMA_NOT_FOUND: sequence is not in this project.");
  const sequenceData = payloadOf(sequence);
  const fps = typeof sequenceData.fps === "number" ? sequenceData.fps : 30;
  const scenes = (await repo.list(scope, "studio_scenes"))
    .filter((row) => String(payloadOf(row).sequence_id ?? "") === sequenceId)
    .sort((a, b) => Number(payloadOf(a).order_index ?? 0) - Number(payloadOf(b).order_index ?? 0));
  const shots = await repo.list(scope, "studio_shots");
  const takes = await repo.list(scope, "studio_takes");
  const assets = await repo.list(scope, "studio_assets");
  const assetById = new Map(assets.map((row) => [row.id, row]));
  const takeById = new Map(takes.map((row) => [row.id, row]));
  const timelineScenes: TimelineScene[] = scenes.map((scene) => {
    const sceneShots = shots
      .filter((row) => String(payloadOf(row).scene_id ?? "") === scene.id)
      .sort((a, b) => Number(payloadOf(a).order_index ?? 0) - Number(payloadOf(b).order_index ?? 0));
    const timelineShots: TimelineShot[] = sceneShots.map((shot) => {
      const shotData = payloadOf(shot);
      const takeId = typeof shotData.selected_take_id === "string" ? shotData.selected_take_id : null;
      const take = takeId ? takeById.get(takeId) : undefined;
      const takeData = take ? (take.payload as Record<string, unknown>) : null;
      const assetId = takeData && typeof takeData.asset_id === "string" ? (takeData.asset_id as string) : null;
      const asset = assetId ? assetById.get(assetId) : undefined;
      const metadata = asset ? (((asset.payload as Record<string, unknown>).metadata ?? {}) as Record<string, unknown>) : {};
      const duration = typeof metadata.durationSeconds === "number" ? (metadata.durationSeconds as number) : null;
      return {
        shotId: shot.id,
        title: String(shotData.title ?? ""),
        orderIndex: Number(shotData.order_index ?? 0),
        takeId,
        durationSeconds: duration,
        width: typeof metadata.width === "number" ? (metadata.width as number) : null,
        height: typeof metadata.height === "number" ? (metadata.height as number) : null,
        contentHash: asset ? String(((asset.payload as Record<string, unknown>).content_hash ?? "") as string) || null : null,
        objectKey: typeof metadata.objectKey === "string" ? (metadata.objectKey as string) : "",
      };
    });
    return {
      sceneId: scene.id,
      title: String(payloadOf(scene).title ?? ""),
      orderIndex: Number(payloadOf(scene).order_index ?? 0),
      shots: timelineShots,
      sceneDurationSeconds: timelineShots.reduce((sum, shot) => sum + (shot.durationSeconds ?? 0), 0),
    };
  });
  return {
    sequenceId,
    title: String(sequenceData.title ?? ""),
    fps,
    scenes: timelineScenes,
    totalDurationSeconds: timelineScenes.reduce((sum, scene) => sum + scene.sceneDurationSeconds, 0),
  };
}
