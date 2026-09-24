import "server-only";

/**
 * P07 RD-01 — fixture job output → Assets library bridge.
 *
 * Root cause: the fixture drain already normalizes provider results and
 * runs the real ingest pipeline (fetch → scan → decode → custody), but
 * custody lands in the lane's own memory stores (`FixtureLane.assets` +
 * local-disk bytes) while the Assets library reads the route-adapter
 * store (`localAssets` in `supabase-data.ts`, written only by
 * `createAssetWithVersion`). No code ever copied one to the other, so
 * fixture job outputs never appeared in Assets while History (which
 * projects from the same runtime store) worked.
 *
 * This bridge stages each COMPLETED fixture job's ingested outputs
 * through the canonical `createAssetWithVersion` path — the same
 * function `POST /assets` uses — keeping fixture bytes on local disk
 * (owned `studio-v5/*` storage keys, never provider URLs, never
 * production storage). Staging is idempotent per (scope, job) via
 * `localStores().keys.fixtureStagedJobs`: replay reuses the index,
 * missing rows self-heal, and rows surviving an index drop are
 * re-adopted by origin lineage instead of duplicated. Routes call it
 * only behind `isStudioFixtureLane()`.
 */
import {
  serializeScope,
  type AssetKind,
  type ProjectScope,
  type TaskName,
} from "@ethen/studio-core/contracts";
import type { FixtureLane } from "@ethen/studio-core/server/runtime/fixture-lane";
import type { RuntimeJob } from "@ethen/studio-core/server/runtime";
import {
  createAssetWithVersion,
  getAssetDetail,
  listAssets,
  type ResolvedScope,
} from "./supabase-data";
import type { LocalLaneKeys } from "./local-lane";

export interface FixtureAssetLane {
  runtime: Pick<FixtureLane, "runtime">["runtime"];
  assets: Pick<FixtureLane, "assets">["assets"];
  storage: Pick<FixtureLane, "storage">["storage"];
}

export interface FixtureStageSkip {
  jobId: string;
  output: string;
  reason: string;
}

export interface FixtureStageReport {
  jobsSeen: number;
  jobsPending: number;
  jobsStaged: number;
  jobsAlreadyStaged: number;
  /** Asset ids created by this call (empty on pure replay). */
  assetsStaged: string[];
  skipped: FixtureStageSkip[];
}

const ASSET_KINDS: ReadonlySet<string> = new Set([
  "image",
  "video",
  "audio",
  "transcript",
  "document",
  "package",
]);

const KIND_EXTENSION: Record<string, string> = {
  image: "png",
  video: "mp4",
  audio: "mp3",
  transcript: "vtt",
  document: "md",
  package: "glb",
};

/** Fallback kind when the storage key carries none (fixture keys always do). */
function kindForTask(task: TaskName): AssetKind {
  if (task.startsWith("image.")) return "image";
  if (task.startsWith("video.") || task === "timeline.render") return "video";
  if (task === "speech.transcribe" || task === "speech.align" || task === "text.translate") return "transcript";
  if (task === "mesh.generate") return "package";
  if (task === "agent.plan" || task === "agent.investigate") return "document";
  return "audio";
}

/** Fixture ingest keys are `studio-v5/<kind>/<uuid>` (owned, local disk). */
function kindForStorageKey(storageKey: string, task: TaskName): AssetKind | null {
  const kind = storageKey.split("/")[1] ?? "";
  if (ASSET_KINDS.has(kind)) return kind as AssetKind;
  return kindForTask(task);
}

function stageKey(scope: ProjectScope, jobId: string): string {
  return `${serializeScope(scope)}:${jobId}`;
}

function parseVersionRef(ref: string): { assetId: string; version: number } | null {
  const match = /^(.+):v(\d+)$/.exec(ref.trim());
  if (!match) return null;
  return { assetId: match[1], version: Number(match[2]) };
}

async function storedByteSize(
  lane: FixtureAssetLane,
  storageKey: string,
): Promise<number | null> {
  const reader = lane.storage as unknown as {
    getObject?: (storageKey: string) => Promise<Uint8Array>;
  };
  if (typeof reader.getObject !== "function") return null;
  try {
    const bytes = await reader.getObject(storageKey);
    return bytes.byteLength;
  } catch {
    return null;
  }
}

async function indexedAssetsSurvive(
  resolved: ResolvedScope,
  assetIds: readonly string[],
): Promise<boolean> {
  for (const assetId of assetIds) {
    const detail = await getAssetDetail(resolved, assetId).catch(() => null);
    if (!detail) return false;
  }
  return true;
}

/**
 * Live rows already staged for a job (by origin lineage), used when the
 * staged index was dropped but the asset rows survived. Tombstoned rows
 * do not count — a tombstoned output re-stages as a fresh row.
 */
async function stagedAssetIdsForJob(
  resolved: ResolvedScope,
  jobId: string,
): Promise<string[]> {
  const origin = `fixture-job:${jobId}`;
  const found: string[] = [];
  let offset = 0;
  for (;;) {
    const page = await listAssets({ scope: resolved, query: "", limit: 200, offset });
    if (page.items.length === 0) break;
    for (const item of page.items) {
      const detail = await getAssetDetail(resolved, item.assetId).catch(() => null);
      if (!detail || detail.tombstonedAt !== null) continue;
      if (detail.versions[0]?.origin === origin) found.push(detail.assetId);
    }
    offset += page.items.length;
    if (offset >= page.total) break;
  }
  return found;
}

/**
 * Stage every COMPLETED fixture job in scope into the canonical local
 * asset lane. Idempotent: replayed jobs reuse the staged index and
 * create nothing; non-terminal jobs are left alone.
 */
export async function stageFixtureJobAssets(
  lane: FixtureAssetLane,
  resolved: ResolvedScope,
  keys: Pick<LocalLaneKeys, "fixtureStagedJobs">,
): Promise<FixtureStageReport> {
  const report: FixtureStageReport = {
    jobsSeen: 0,
    jobsPending: 0,
    jobsStaged: 0,
    jobsAlreadyStaged: 0,
    assetsStaged: [],
    skipped: [],
  };
  const jobs: readonly RuntimeJob[] = await lane.runtime.listJobs(resolved.projectId, undefined, 50);
  const ingestVersions = lane.assets.versions();
  for (const job of jobs) {
    report.jobsSeen += 1;
    if (job.status !== "COMPLETED") {
      report.jobsPending += 1;
      continue;
    }
    const key = stageKey(resolved.scope, job.jobId);
    const indexed = keys.fixtureStagedJobs.get(key);
    if (indexed && indexed.length > 0 && (await indexedAssetsSurvive(resolved, indexed))) {
      report.jobsAlreadyStaged += 1;
      continue;
    }
    if (indexed) keys.fixtureStagedJobs.delete(key);
    // Index dropped but rows survived (registry reset): re-adopt the
    // live rows instead of duplicating them.
    const adopted = await stagedAssetIdsForJob(resolved, job.jobId);
    if (adopted.length > 0) {
      keys.fixtureStagedJobs.set(key, adopted);
      report.jobsAlreadyStaged += 1;
      continue;
    }
    const staged = await stageJob(lane, resolved, job, ingestVersions, report.skipped);
    keys.fixtureStagedJobs.set(key, staged);
    report.jobsStaged += 1;
    report.assetsStaged.push(...staged);
  }
  return report;
}

async function stageJob(
  lane: FixtureAssetLane,
  resolved: ResolvedScope,
  job: RuntimeJob,
  ingestVersions: ReturnType<FixtureAssetLane["assets"]["versions"]>,
  skipped: FixtureStageSkip[],
): Promise<string[]> {
  const generations = lane.runtime.listGenerations(job.jobId, resolved.scope);
  const staged: string[] = [];
  const seenIngestAssets = new Set<string>();
  let index = 0;
  for (const generation of generations) {
    if (generation.quarantined) {
      skipped.push({ jobId: job.jobId, output: generation.generationId, reason: "quarantined generation" });
      continue;
    }
    for (const ref of generation.assetVersionIds) {
      index += 1;
      const parsed = parseVersionRef(ref);
      const record = parsed
        ? ingestVersions.find((row) => row.assetId === parsed.assetId && row.version === parsed.version)
        : undefined;
      if (!parsed || !record) {
        skipped.push({ jobId: job.jobId, output: ref, reason: "ingest record missing" });
        continue;
      }
      if (serializeScope(record.scope) !== serializeScope(resolved.scope)) {
        skipped.push({ jobId: job.jobId, output: ref, reason: "cross-scope output" });
        continue;
      }
      if (seenIngestAssets.has(record.assetId)) continue;
      seenIngestAssets.add(record.assetId);
      if (!/^[0-9a-f]{64}$/.test(record.sha256)) {
        skipped.push({ jobId: job.jobId, output: ref, reason: "invalid sha256" });
        continue;
      }
      if (!record.storageKey || /^https?:\/\//i.test(record.storageKey)) {
        skipped.push({ jobId: job.jobId, output: ref, reason: "storage key is not an owned key" });
        continue;
      }
      const kind = kindForStorageKey(record.storageKey, job.task);
      if (!kind) {
        skipped.push({ jobId: job.jobId, output: ref, reason: "unknown asset kind" });
        continue;
      }
      const byteSize = await storedByteSize(lane, record.storageKey);
      if (byteSize === null) {
        skipped.push({ jobId: job.jobId, output: ref, reason: "stored bytes unreadable" });
        continue;
      }
      const detail = await createAssetWithVersion(resolved, {
        filename: `fixture-${job.jobId}-${index}.${KIND_EXTENSION[kind] ?? "bin"}`,
        kind,
        storageKey: record.storageKey,
        sha256: record.sha256.toLowerCase(),
        byteSize,
        origin: `fixture-job:${job.jobId}`,
        mediaMetadata: {
          jobId: job.jobId,
          task: job.task,
          endpointId: job.endpointId,
          attemptId: generation.attemptId,
          generationId: generation.generationId,
          ingestAssetId: record.assetId,
          ingestVersion: record.version,
          stagedBy: "p07-fixture-bridge",
        },
      });
      staged.push(detail.assetId);
    }
  }
  return staged;
}
