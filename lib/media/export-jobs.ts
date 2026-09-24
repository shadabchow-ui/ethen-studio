/**
 * Studio V2 Job 07 — export jobs onto studio_exports rows.
 * Every export pins exact AssetVersion inputs, Take, timeline/timebase,
 * approvals, destination, and provenance status in a canonical manifest.
 * Execution is inline and bounded (DB + sign + manifest build, no
 * provider): lifecycle pending -> ready | failed, idempotent per project
 * key so retries and duplicates replay instead of duplicating work.
 */

import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createServiceClient } from "@ethen/database/service";
import { uploadTenantObject } from "@ethen/database/storage/tenant-object-storage";
import type { StudioPersistenceScope, StudioRepository } from "./persistence/studio-repository";
import { assertExportPreset, type ExportPresetName } from "./export-presets";
import { buildStoredZip } from "./zip";
import { buildFcpxmlDocument } from "./fcpxml";
import { buildC2PAManifest } from "./c2pa";

export interface ExportInput {
  preset: string;
  assetIds: string[];
  takeId?: string | null;
  timeline?: { name?: string; fps?: number } | null;
  planId?: string | null;
  title?: string | null;
  rightsNote?: string | null;
}

export interface ResolvedExportAsset {
  assetId: string;
  kind: string;
  title: string;
  contentHash: string;
  mimeType: string;
  objectKey: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  jobId: string | null;
}

export interface ExportManifest {
  preset: ExportPresetName;
  presetVersion: string;
  title: string;
  inputs: Array<{ assetId: string; contentHash: string; kind: string }>;
  takeId: string | null;
  timeline: { name: string; fps: number } | null;
  approvals: ExportApprovals;
  destination: { kind: "export-object"; objectKey: string };
  files: Array<{ name: string; bytes: number; sha256: string }>;
  manifestHash: string;
  exportedAt: string;
}

export interface ExportApprovals {
  plan: { planId: string; acceptedBy: string | null; acceptedAt: string | null; status: string } | null;
  locks: Array<{ entityKind: string; entityId: string; entityRevision: number }>;
  evalEvidence: Array<{ id: string; verdict: string }>;
  rights: { state: "unknown" | "attested"; note: string | null };
}

export interface ExportDeps {
  fetchBytes?(objectKey: string): Promise<Uint8Array>;
  storeBytes?(input: { projectId: string; actorId: string; bytes: Uint8Array; contentType: string; filename: string; idempotencyKey: string }): Promise<{ objectKey: string }>;
}

export interface ExecutedExport {
  exportId: string;
  replayed: boolean;
  manifestHash: string;
  objectKey: string;
  lifecycle: string;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function manifestHashOf(manifest: Omit<ExportManifest, "manifestHash" | "exportedAt">): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

async function defaultFetchBytes(objectKey: string): Promise<Uint8Array> {
  const client = createServiceClient();
  if (!client) throw new Error("Export bytes require a configured service client.");
  const { data, error } = await client.storage.from("project-objects").download(objectKey);
  if (error || !data) throw new Error(`EXPORT_STORAGE: object download failed: ${error?.message ?? "empty"}.`);
  return new Uint8Array(await data.arrayBuffer());
}

interface StoreBytesInput {
  projectId: string;
  actorId: string;
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  idempotencyKey: string;
}

async function defaultStoreBytes(input: StoreBytesInput): Promise<{ objectKey: string }> {
  const stored = await uploadTenantObject({
    projectId: input.projectId, actorId: input.actorId,
    bytes: input.bytes, contentType: input.contentType, filename: input.filename,
    source: "studio", retentionDays: 90, idempotencyKey: input.idempotencyKey,
  });
  return { objectKey: stored.objectKey };
}

/** Gather approval evidence: plan acceptance, current locks, eval verdicts. */
export async function gatherApprovalEvidence(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: { planId?: string | null; assetIds: readonly string[]; jobIds: readonly string[]; rightsNote?: string | null },
): Promise<ExportApprovals> {
  let plan: ExportApprovals["plan"] = null;
  if (input.planId) {
    const row = await repo.get(scope, "studio_director_plans", input.planId).catch(() => null);
    if (row) {
      const data = row.payload as Record<string, unknown>;
      plan = {
        planId: row.id,
        acceptedBy: typeof data.accepted_by === "string" ? data.accepted_by : null,
        acceptedAt: typeof data.accepted_at === "string" ? data.accepted_at : null,
        status: String(data.status ?? ""),
      };
    }
  }
  const locks = await repo.list(scope, "studio_decision_locks").catch(() => []);
  const lockPins = locks
    .filter((row) => {
      const data = row.payload as Record<string, unknown>;
      return (data.superseded_by ?? null) === null && input.assetIds.includes(String(data.entity_id ?? ""));
    })
    .map((row) => {
      const data = row.payload as Record<string, unknown>;
      return {
        entityKind: String(data.entity_kind ?? ""),
        entityId: String(data.entity_id ?? ""),
        entityRevision: typeof data.entity_revision === "number" ? data.entity_revision : 1,
      };
    });
  const evidence = await repo.list(scope, "studio_evaluation_evidence").catch(() => []);
  const evalPins = evidence
    .filter((row) => input.jobIds.includes(String((row.payload as Record<string, unknown>).job_id ?? "")))
    .map((row) => ({
      id: row.id,
      verdict: String((row.payload as Record<string, unknown>).verdict ?? ""),
    }));
  return {
    plan,
    locks: lockPins,
    evalEvidence: evalPins,
    rights: input.rightsNote
      ? { state: "attested", note: input.rightsNote }
      : { state: "unknown", note: "No rights attestation supplied with this export." },
  };
}

async function resolveAssets(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  assetIds: readonly string[],
): Promise<ResolvedExportAsset[]> {
  if (assetIds.length === 0) throw new Error("EXPORT_INVALID: at least one asset is required.");
  if (assetIds.length > 50) throw new Error("EXPORT_INVALID: at most 50 assets per export.");
  const resolved: ResolvedExportAsset[] = [];
  for (const assetId of assetIds) {
    const row = await repo.get(scope, "studio_assets", assetId);
    if (!row) throw new Error(`EXPORT_NOT_FOUND: asset ${assetId.slice(0, 8)}… is not in this project.`);
    const data = row.payload as Record<string, unknown>;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    const contentHash = typeof data.content_hash === "string" ? data.content_hash : "";
    if (!/^[0-9a-f]{64}$/i.test(contentHash)) {
      throw new Error(`EXPORT_INVALID: asset ${assetId.slice(0, 8)}… has no content hash.`);
    }
    const objectKey = typeof metadata.objectKey === "string" ? metadata.objectKey : "";
    if (!objectKey) throw new Error(`EXPORT_INVALID: asset ${assetId.slice(0, 8)}… has no owned object.`);
    resolved.push({
      assetId: row.id,
      kind: typeof data.asset_kind === "string" ? data.asset_kind : "unknown",
      title: typeof metadata.name === "string" ? metadata.name : row.id,
      contentHash,
      mimeType: typeof metadata.mimeType === "string" ? metadata.mimeType : "application/octet-stream",
      objectKey,
      width: typeof metadata.width === "number" ? metadata.width : null,
      height: typeof metadata.height === "number" ? metadata.height : null,
      durationSeconds: typeof metadata.durationSeconds === "number" ? metadata.durationSeconds : null,
      jobId: typeof metadata.jobId === "string" ? metadata.jobId : null,
    });
  }
  return resolved;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function assertPng(bytes: Uint8Array, assetId: string): void {
  if (bytes.length < 8 || !PNG_MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw new Error(`EXPORT_SEQUENCE_INVALID: asset ${assetId.slice(0, 8)}… is not PNG bytes; conversion is unsupported.`);
  }
}

function frameName(index: number): string {
  return `frame_${String(index + 1).padStart(6, "0")}.png`;
}

function findExportRow(rows: Awaited<ReturnType<StudioRepository["list"]>>, key: string): (typeof rows)[number] | undefined {
  return rows.find((row) => ((row.payload as Record<string, unknown>).idempotency_key as string) === key);
}

/**
 * Execute an export job: resolve, verify, build, store, record. Idempotent
 * per project key — ready rows replay, failed rows retry, never duplicates.
 */
export async function executeExportJob(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  idempotencyKey: string,
  input: ExportInput,
  deps: ExportDeps = {},
): Promise<ExecutedExport> {
  assertExportPreset(input.preset);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
    throw new Error("EXPORT_INVALID: idempotency key must be 8-128 chars.");
  }
  const fetchBytes = deps.fetchBytes ?? defaultFetchBytes;
  const storeBytes = deps.storeBytes ?? defaultStoreBytes;

  const existing = findExportRow(await repo.list(scope, "studio_exports"), idempotencyKey);
  if (existing) {
    const data = existing.payload as Record<string, unknown>;
    const destination = (data.destination ?? {}) as Record<string, unknown>;
    if (String(data.lifecycle ?? "") === "ready") {
      return {
        exportId: existing.id, replayed: true,
        manifestHash: String(destination.manifestHash ?? ""),
        objectKey: String(destination.objectKey ?? ""),
        lifecycle: "ready",
      };
    }
    // Failed or interrupted rows retry through the same key below.
  }

  const assets = await resolveAssets(repo, scope, input.assetIds);
  const jobIds = [...new Set(assets.map((asset) => asset.jobId).filter((id): id is string => Boolean(id)))];
  const approvals = await gatherApprovalEvidence(repo, scope, {
    planId: input.planId ?? null, assetIds: assets.map((asset) => asset.assetId), jobIds,
    rightsNote: input.rightsNote ?? null,
  });

  let takeId: string | null = null;
  let timeline: { name: string; fps: number } | null = null;
  if (input.takeId) {
    const take = await repo.get(scope, "studio_takes", input.takeId).catch(() => null);
    if (!take) throw new Error("EXPORT_NOT_FOUND: take is not in this project.");
    takeId = take.id;
  }

  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  let contentType = "application/octet-stream";
  let filename = `export-${Date.now().toString(36)}`;

  if (input.preset === "original") {
    if (assets.length !== 1 || !assets[0]) throw new Error("EXPORT_INVALID: original preset exports exactly one asset.");
    const bytes = await fetchBytes(assets[0].objectKey);
    assertBytesMatch(bytes, assets[0]);
    files.push({ name: safeFilename(assets[0].title, assets[0].mimeType), bytes });
    contentType = assets[0].mimeType;
    filename = files[0]?.name ?? filename;
  } else if (input.preset === "handoff-zip") {
    for (const [index, asset] of assets.entries()) {
      const bytes = await fetchBytes(asset.objectKey);
      assertBytesMatch(bytes, asset);
      files.push({ name: `assets/${String(index).padStart(3, "0")}-${asset.assetId.slice(0, 8)}-${safeFilename(asset.title, asset.mimeType)}`, bytes });
    }
    contentType = "application/zip";
    filename = "handoff.zip";
  } else if (input.preset === "png-sequence") {
    const fps = 24;
    timeline = { name: input.title?.trim() || "sequence", fps };
    for (const [index, asset] of assets.entries()) {
      if (asset.kind !== "generation" && asset.kind !== "import" && !asset.mimeType.startsWith("image/")) {
        throw new Error(`EXPORT_SEQUENCE_INVALID: asset ${asset.assetId.slice(0, 8)}… is ${asset.kind}; frame sequences need decoded images and the runtime has no video decoder.`);
      }
      const bytes = await fetchBytes(asset.objectKey);
      assertBytesMatch(bytes, asset);
      assertPng(bytes, asset.assetId);
      files.push({ name: frameName(index), bytes });
    }
    contentType = "application/zip";
    filename = "sequence.zip";
  } else if (input.preset === "fcpxml") {
    const fps = input.timeline?.fps ?? 30;
    if (![24, 25, 30, 60].includes(fps)) throw new Error("EXPORT_FCPXML_INVALID: fps must be 24, 25, 30, or 60.");
    timeline = { name: input.title?.trim() || "timeline", fps };
    const clips = [];
    for (const asset of assets) {
      if (asset.kind !== "video") {
        throw new Error(`EXPORT_FCPXML_INVALID: asset ${asset.assetId.slice(0, 8)}… is ${asset.kind}; V1 timelines admit measured video takes only (no invented holds).`);
      }
      if (asset.durationSeconds === null || !(asset.durationSeconds > 0)) {
        throw new Error(`EXPORT_FCPXML_INVALID: asset ${asset.assetId.slice(0, 8)}… has no measured duration.`);
      }
      clips.push({
        assetId: asset.assetId, objectKey: asset.objectKey, contentHash: asset.contentHash,
        durationSeconds: asset.durationSeconds, width: asset.width, height: asset.height, name: asset.title,
      });
    }
    const xml = buildFcpxmlDocument({ timelineName: timeline.name, timebase: { fps }, clips });
    files.push({ name: "timeline.fcpxml", bytes: new TextEncoder().encode(xml) });
    contentType = "application/xml";
    filename = "timeline.fcpxml";
  } else {
    // c2pa-sidecar: standards-shaped, honestly unsigned provenance.
    const manifestInput = {
      title: input.title?.trim() || "export",
      ingredients: assets.map((asset) => ({
        assetId: asset.assetId, contentHash: asset.contentHash, mimeType: asset.mimeType,
        title: asset.title, relationship: "parentOf" as const,
      })),
      exportPreset: input.preset, exportPresetVersion: "v1", manifestHash: "pending",
    };
    const sidecar = buildC2PAManifest(manifestInput);
    files.push({ name: "provenance.c2pa.json", bytes: new TextEncoder().encode(JSON.stringify(sidecar, null, 2)) });
    contentType = "application/json";
    filename = "provenance.c2pa.json";
  }

  const fileManifest = files.map((file) => ({
    name: file.name, bytes: file.bytes.length, sha256: sha256Hex(file.bytes),
  }));
  // The manifest describes payload content, not itself: bundles embed it as
  // manifest.json afterwards, keeping the hash non-circular and reproducible.
  const manifestBase = {
    preset: input.preset,
    presetVersion: "v1",
    title: input.title?.trim() || "export",
    inputs: assets.map((asset) => ({ assetId: asset.assetId, contentHash: asset.contentHash, kind: asset.kind })),
    takeId,
    timeline,
    approvals,
    destination: { kind: "export-object" as const, objectKey: "" },
    files: fileManifest,
  };
  const manifestHash = manifestHashOf(manifestBase);
  const manifest: ExportManifest = { ...manifestBase, destination: { kind: "export-object", objectKey: "" }, manifestHash, exportedAt: new Date().toISOString() };

  let payloadBytes: Uint8Array;
  if (input.preset === "handoff-zip" || input.preset === "png-sequence") {
    const manifestEntry = { name: "manifest.json", data: new TextEncoder().encode(JSON.stringify({ ...manifest, files: fileManifest }, null, 2)) };
    payloadBytes = buildStoredZip([...files.map((file) => ({ name: file.name, data: file.bytes })), manifestEntry]);
  } else {
    payloadBytes = files[0]?.bytes ?? new Uint8Array(0);
  }

  // Rows start pending so an interrupted store retries instead of vanishing.
  // The same row id is reused across retries: one logical export per key.
  const exportId = existing?.id ?? randomUUID();
  if (existing) {
    await repo.patchSystemRecord(scope, "studio_exports", existing.id, { lifecycle: "pending" }).catch(() => null);
  } else {
    const at = new Date().toISOString();
    await repo.insert(scope, "studio_exports", {
      id: exportId,
      payload: {
        asset_id: assets.length === 1 && assets[0] ? assets[0].assetId : null,
        lifecycle: "pending", idempotency_key: idempotencyKey,
        destination: { preset: input.preset, presetVersion: "v1", manifestHash },
      },
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
  }
  let stored: { objectKey: string };
  try {
    stored = await storeBytes({
      projectId: scope.projectId, actorId: scope.actorId,
      bytes: payloadBytes, contentType, filename, idempotencyKey: `export-${idempotencyKey}`,
    });
  } catch (error) {
    await repo.patchSystemRecord(scope, "studio_exports", exportId, { lifecycle: "failed" }).catch(() => null);
    throw new Error(`EXPORT_STORAGE: ${error instanceof Error ? error.message : String(error)}`);
  }
  manifest.destination.objectKey = stored.objectKey;

  await repo.patchSystemRecord(scope, "studio_exports", exportId, {
    lifecycle: "ready",
    destination: { ...manifest.destination, manifest, manifestHash, preset: input.preset, presetVersion: "v1" },
  });
  return { exportId, replayed: false, manifestHash, objectKey: stored.objectKey, lifecycle: "ready" };
}

function assertBytesMatch(bytes: Uint8Array, asset: ResolvedExportAsset): void {
  const actual = sha256Hex(bytes);
  if (actual.toLowerCase() !== asset.contentHash.toLowerCase()) {
    throw new Error(`EXPORT_INTEGRITY: downloaded bytes do not match the pinned hash for ${asset.assetId.slice(0, 8)}….`);
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeFilename(title: string, mimeType: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "asset";
  const ext = mimeType === "image/png" ? ".png" : mimeType === "image/jpeg" ? ".jpg" : mimeType === "video/mp4" ? ".mp4" : mimeType === "application/zip" ? ".zip" : "";
  return `${base}${ext}`;
}
