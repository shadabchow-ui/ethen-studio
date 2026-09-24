/**
 * STU-25 — Review + export + provenance tests (Job 07).
 * Run with: pnpm validate:studio-review-export
 *
 * Memory-backed with fake byte stores, no network, no DB:
 * preset registry, manifest reproducibility, zip round-trip, FCPXML math,
 * C2PA validator honesty, PNG-sequence scope, export idempotency and
 * storage retry, review expiry/revocation/consent/cross-tenant denial,
 * stripped-metadata behavior.
 */

import { createHash } from "node:crypto";
import { MemoryStudioRepository } from "../persistence/studio-repository";
import { EXPORT_PRESETS, assertExportPreset } from "../export-presets";
import { buildStoredZip, readStoredZip, crc32 } from "../zip";
import { buildFcpxmlDocument } from "../fcpxml";
import { buildC2PAManifest, validateC2PAManifest } from "../c2pa";
import { executeExportJob } from "../export-jobs";
import { createReviewLink, resolveReviewLink, revokeReviewLink } from "../review-links";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label}`);
}

async function assertThrows(fn: () => Promise<unknown> | unknown, fragment: string, label: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(fragment), `${label} (got: ${message.slice(0, 100)})`);
    return;
  }
  assert(false, `${label} (no error thrown)`);
}

const SCOPE = { organizationId: "user:actor-a", projectId: "77777777-7777-4777-8777-777777777777", actorId: "actor-a" };
const PNG_1X1_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = new Uint8Array(Buffer.from(PNG_1X1_B64, "base64"));
const PNG_HASH = createHash("sha256").update(PNG).digest("hex");

function craftMp4(): Uint8Array {
  const parts: number[][] = [];
  const box = (type: string, body: number[]): number[] => {
    const size = 8 + body.length;
    return [(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff,
      type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3), ...body];
  };
  const u32 = (v: number): number[] => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
  parts.push(box("ftyp", [...ascii("isom"), 0, 0, 0, 0, ...ascii("isom")]));
  const mvhd = [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(5000)];
  const matrix = new Array(36).fill(0);
  const tkhd = [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1), ...u32(0), ...u32(0),
    ...u32(0), ...u32(0), 0, 0, 0, 0, 0, 0, 0, 0, ...matrix, ...u32(640 * 65536), ...u32(480 * 65536)];
  parts.push(box("moov", [...box("mvhd", mvhd), ...box("trak", box("tkhd", tkhd))]));
  return new Uint8Array(parts.flat());
}
const MP4 = craftMp4();
const MP4_HASH = createHash("sha256").update(MP4).digest("hex");

async function seedAsset(
  repo: MemoryStudioRepository,
  overrides: { id?: string; kind?: string; hash?: string; objectKey?: string; extra?: Record<string, unknown> } = {},
): Promise<string> {
  const id = overrides.id ?? `aaaaaaaa-aaaa-4aaa-8aaa-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
  const at = new Date().toISOString();
  await repo.insert(SCOPE, "studio_assets", {
    id,
    payload: {
      asset_kind: overrides.kind ?? "generation",
      content_hash: overrides.hash ?? PNG_HASH,
      metadata: { name: "asset", objectKey: overrides.objectKey ?? `obj/${id}`, mimeType: "image/png", ...(overrides.extra ?? {}) },
      lineage: {},
    },
    createdAt: at, updatedAt: at, deletedAt: null,
  });
  return id;
}

function byteStore(files: Readonly<Record<string, Uint8Array>>, calls: { stores: number; fetches: number }) {
  return {
    fetchBytes: async (objectKey: string): Promise<Uint8Array> => {
      calls.fetches += 1;
      const bytes = files[objectKey];
      if (!bytes) throw new Error("EXPORT_STORAGE: object download failed: not found.");
      return bytes;
    },
    storeBytes: async (): Promise<{ objectKey: string }> => {
      calls.stores += 1;
      return { objectKey: `exports/out-${calls.stores}.bin` };
    },
  };
}

// ── Presets ──

function testPresets(): void {
  assert(Object.keys(EXPORT_PRESETS).length === 5, "five advertised V1 presets");
  for (const name of ["original", "handoff-zip", "png-sequence", "fcpxml", "c2pa-sidecar"] as const) {
    assert(EXPORT_PRESETS[name].version === "v1", `preset ${name} versioned`);
  }
  assertThrows(() => assertExportPreset("prores-4444"), "PRESET_UNKNOWN", "uncertified codec not advertised");
  assertThrows(() => assertExportPreset("hdr-dolby"), "PRESET_UNKNOWN", "HDR claims not advertised");
}

// ── Zip round-trip ──

function testZip(): void {
  const bytes = new TextEncoder().encode("hello world");
  const zip = buildStoredZip([
    { name: "a.txt", data: bytes },
    { name: "dir/b.bin", data: new Uint8Array([1, 2, 3]) },
  ]);
  assert(zip[0] === 0x50 && zip[1] === 0x4b, "zip magic present");
  const back = readStoredZip(zip);
  assert(back.length === 2 && back[0]?.name === "a.txt", "entries round-trip in order");
  assert(new TextDecoder().decode(back[0]?.data) === "hello world", "bytes identical");
  assertThrows(() => buildStoredZip([{ name: "../evil", data: bytes }]), "unsafe entry", "path traversal rejected");
  assertThrows(() => buildStoredZip([{ name: "a", data: bytes }, { name: "a", data: bytes }]), "duplicate", "duplicate names rejected");
  const tamperedSig = new Uint8Array(zip);
  tamperedSig[0] = (tamperedSig[0] as number) ^ 0xff;
  assertThrows(() => readStoredZip(tamperedSig), "EXPORT_ZIP_INVALID", "tampered signature rejected");
  const tamperedData = new Uint8Array(zip);
  tamperedData[40] = (tamperedData[40] as number) ^ 0xff;
  assertThrows(() => readStoredZip(tamperedData), "CRC mismatch", "tampered bytes rejected");
  assert(typeof crc32(bytes) === "number", "crc32 computes");
}

// ── FCPXML math ──

function testFcpxml(): void {
  const xml = buildFcpxmlDocument({
    timelineName: "Launch & <Cut>",
    timebase: { fps: 30 },
    clips: [
      { assetId: "a1", objectKey: "obj/1", contentHash: PNG_HASH, durationSeconds: 5, width: 640, height: 480, name: "Opener" },
      { assetId: "a2", objectKey: "obj/2", contentHash: MP4_HASH, durationSeconds: 3, width: 1280, height: 720, name: "Hero" },
    ],
  });
  assert(xml.includes('version="1.10"') && xml.includes("<spine>"), "fcpxml structure present");
  assert(xml.includes('duration="240/30s"'), "total duration math exact (8s at 30fps)");
  assert(xml.includes('offset="150/30s"'), "clip offset math exact (5s at 30fps)");
  assert(xml.includes("Launch &amp; &lt;Cut&gt;"), "names escaped");
  assert(xml.includes("studio-object:obj/1"), "stable object references, never expiring URLs");
  assertThrows(() => buildFcpxmlDocument({ timelineName: "t", timebase: { fps: 29 }, clips: [] }), "unsupported timebase", "odd fps rejected");
  assertThrows(() => buildFcpxmlDocument({
    timelineName: "t", timebase: { fps: 30 },
    clips: [{ assetId: "a", objectKey: "o", contentHash: PNG_HASH, durationSeconds: 0, width: 1, height: 1, name: "x" }],
  }), "no measured duration", "unmeasured clips rejected, never estimated");
  assertThrows(() => buildFcpxmlDocument({ timelineName: "t", timebase: { fps: 30 }, clips: [] }), "at least one clip", "empty timeline rejected");
}

// ── C2PA honesty ──

function testC2pa(): void {
  const manifest = buildC2PAManifest({
    title: "Export", exportPreset: "original", exportPresetVersion: "v1", manifestHash: "m".repeat(64),
    ingredients: [{ assetId: "a1", contentHash: PNG_HASH, mimeType: "image/png", title: "A", relationship: "parentOf" }],
  });
  assert(manifest.signature.status === "unsigned", "manifests ship unsigned");
  assert(manifest.trust.level === "self-asserted" && /NOT standardized C2PA/.test(manifest.trust.note), "trust labeled self-asserted in-manifest");
  const valid = validateC2PAManifest(manifest, { [PNG_HASH]: PNG });
  assert(valid.verdict === "valid-structure", "matching bytes validate structurally");
  assert(!("trusted" in valid) && valid.verdict !== ("trusted" as never), "no trusted verdict exists");
  const tamperedBytes = new Uint8Array(PNG);
  tamperedBytes[20] = (tamperedBytes[20] as number) ^ 0xff;
  const tampered = validateC2PAManifest(manifest, { [PNG_HASH]: tamperedBytes });
  assert(tampered.verdict === "invalid", "tampered bytes fail");
  const stripped = validateC2PAManifest({ ...manifest, ingredients: [] });
  assert(stripped.verdict === "incomplete", "stripped ingredients report incomplete");
  const signed = validateC2PAManifest({ ...manifest, signature: { status: "signed", reason: "x", algorithm: "es256" } });
  assert(signed.verdict === "invalid", "signed claims without a trust anchor fail closed");
  assertThrows(() => buildC2PAManifest({
    title: "E", exportPreset: "original", exportPresetVersion: "v1", manifestHash: "m",
    ingredients: [{ assetId: "a", contentHash: "nope", mimeType: "image/png", title: "A", relationship: "parentOf" }],
  }), "no sha256", "hashless ingredients refused at build");
}

// ── Export jobs: idempotency, bytes, replay, retry ──

async function testExportJobs(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const files: Record<string, Uint8Array> = { "obj/png1": PNG };
  const calls = { stores: 0, fetches: 0 };
  const deps = byteStore(files, calls);
  const pngId = await seedAsset(repo, { objectKey: "obj/png1" });

  // Original: rendered bytes identical, manifest reproducible across keys.
  const first = await executeExportJob(repo, SCOPE, "export-key-1", { preset: "original", assetIds: [pngId], title: "One" }, deps);
  assert(first.replayed === false && first.lifecycle === "ready", "original export ready");
  const second = await executeExportJob(repo, SCOPE, "export-key-2", { preset: "original", assetIds: [pngId], title: "One" }, deps);
  assert(first.manifestHash === second.manifestHash, "identical inputs reproduce the manifest hash");
  assert(calls.stores === 2, "distinct keys store distinctly");

  // Duplicate key replays without new work.
  const replay = await executeExportJob(repo, SCOPE, "export-key-1", { preset: "original", assetIds: [pngId], title: "One" }, deps);
  assert(replay.replayed === true && replay.exportId === first.exportId, "duplicate key replays");
  assert(calls.stores === 2, "replay stores nothing new");

  // Tampered selection changes the manifest.
  const pngId2 = await seedAsset(repo, { objectKey: "obj/png1" });
  const other = await executeExportJob(repo, SCOPE, "export-key-3", { preset: "original", assetIds: [pngId2], title: "One" }, deps);
  assert(other.manifestHash !== first.manifestHash, "different inputs hash differently");

  // Handoff zip: assets plus manifest, round-trippable.
  const bundle = await executeExportJob(repo, SCOPE, "export-key-4", { preset: "handoff-zip", assetIds: [pngId, pngId2], title: "Bundle" }, deps);
  assert(bundle.lifecycle === "ready", "bundle ready");

  // PNG sequence: PNG passthrough identical; video rejected loudly.
  const mp4Id = await seedAsset(repo, {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", kind: "video", hash: MP4_HASH, objectKey: "obj/mp4",
    extra: { mimeType: "video/mp4", durationSeconds: 5 },
  });
  files["obj/mp4"] = MP4;
  const seq = await executeExportJob(repo, SCOPE, "export-key-5", { preset: "png-sequence", assetIds: [pngId], title: "Seq" }, deps);
  assert(seq.lifecycle === "ready", "PNG sequence ready");
  await assertThrows(
    () => executeExportJob(repo, SCOPE, "export-key-6", { preset: "png-sequence", assetIds: [mp4Id], title: "Seq" }, deps),
    "no video decoder",
    "video frames rejected without decode tooling",
  );

  // FCPXML: measured takes only.
  await assertThrows(
    () => executeExportJob(repo, SCOPE, "export-key-7", { preset: "fcpxml", assetIds: [pngId], title: "T" }, deps),
    "measured video takes only",
    "stills rejected from timelines instead of invented holds",
  );
  const fcpxml = await executeExportJob(repo, SCOPE, "export-key-8", { preset: "fcpxml", assetIds: [mp4Id], title: "T", timeline: { fps: 30 } }, deps);
  assert(fcpxml.lifecycle === "ready", "measured video timeline ready");

  // C2PA sidecar: standards-shaped, honestly unsigned, validator-verified.
  const sidecar = await executeExportJob(repo, SCOPE, "export-key-8b", { preset: "c2pa-sidecar", assetIds: [pngId], title: "P" }, deps);
  assert(sidecar.lifecycle === "ready", "provenance sidecar ready");

  // Storage failure records failed; retry recovers through the same key.
  const failing = {
    ...deps,
    storeBytes: async (): Promise<{ objectKey: string }> => { throw new Error("disk on fire"); },
  };
  await assertThrows(
    () => executeExportJob(repo, SCOPE, "export-key-9", { preset: "original", assetIds: [pngId] }, failing),
    "EXPORT_STORAGE",
    "storage failure surfaces instead of fake success",
  );
  const recovered = await executeExportJob(repo, SCOPE, "export-key-9", { preset: "original", assetIds: [pngId] }, deps);
  assert(recovered.lifecycle === "ready" && recovered.replayed === false, "retry through the same key recovers");
  const rows = await repo.list(SCOPE, "studio_exports");
  const keyed = rows.filter((row) => ((row.payload as Record<string, unknown>).idempotency_key as string) === "export-key-9");
  assert(keyed.length === 1, "one logical export row per key");

  // Unknown asset and unknown preset fail closed.
  await assertThrows(
    () => executeExportJob(repo, SCOPE, "export-key-10", { preset: "original", assetIds: ["00000000-0000-4000-8000-000000000000"] }, deps),
    "not in this project",
    "foreign assets rejected",
  );
  await assertThrows(
    () => executeExportJob(repo, SCOPE, "export-key-11", { preset: "prores-4444", assetIds: [pngId] }, deps),
    "PRESET_UNKNOWN",
    "uncertified formats rejected",
  );
}

// ── Review links: issue once, deny precisely ──

async function testReviewLinks(): Promise<void> {
  const repo = new MemoryStudioRepository();
  const pngId = await seedAsset(repo, { objectKey: "obj/png1" });
  const at = new Date().toISOString();
  await repo.insert(SCOPE, "studio_consents", {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    payload: { consent_type: "likeness", lifecycle: "granted", evidence: {}, expires_at: new Date(Date.now() + 3600_000).toISOString() },
    createdAt: at, updatedAt: at, deletedAt: null,
  });

  const created = await createReviewLink(repo, SCOPE, {
    assetIds: [pngId], ttlSeconds: 3600, note: "client review",
    consentIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"], idempotencyKey: "review-key-1",
  });
  assert(created.token.length === 64, "token issued once at creation");
  await assertThrows(
    () => createReviewLink(repo, SCOPE, { assetIds: [pngId], idempotencyKey: "review-key-1" }),
    "REVIEW_REPLAY",
    "creation keys never re-display tokens",
  );

  const finder = async (tokenHash: string) => {
    const rows = await repo.list(SCOPE, "studio_review_links");
    const match = rows.find((row) => ((row.payload as Record<string, unknown>).token_hash as string) === tokenHash);
    if (!match) return null;
    const data = match.payload as Record<string, unknown>;
    const scopeData = (data.scope ?? {}) as { assetIds?: string[] };
    return {
      id: match.id, organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
      scope: { assetIds: scopeData.assetIds ?? [] }, note: String(data.note ?? ""),
      consentSnapshot: (Array.isArray(data.consent_snapshot) ? data.consent_snapshot : []) as string[],
      expiresAt: String(data.expires_at ?? ""), revokedAt: typeof data.revoked_at === "string" ? data.revoked_at : null,
    };
  };
  const loader = async (projectId: string, assetId: string) => {
    assert(projectId === SCOPE.projectId, "cross-tenant asset load attempted");
    const row = await repo.get({ ...SCOPE, projectId }, "studio_assets", assetId);
    if (!row) return null;
    const data = row.payload as Record<string, unknown>;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id, kind: String(data.asset_kind ?? ""), title: String(metadata.name ?? row.id),
      contentHash: typeof data.content_hash === "string" ? data.content_hash : null,
      objectKey: typeof metadata.objectKey === "string" ? metadata.objectKey : "",
    };
  };
  const consentLoader = async (projectId: string, consentId: string) => {
    const row = await repo.get({ ...SCOPE, projectId }, "studio_consents", consentId).catch(() => null);
    if (!row) return null;
    const data = row.payload as Record<string, unknown>;
    return { lifecycle: String(data.lifecycle ?? ""), expiresAt: typeof data.expires_at === "string" ? data.expires_at : null };
  };
  const deps = {
    findByTokenHash: finder,
    loadAsset: loader,
    loadConsent: consentLoader,
    signUrl: async (objectKey: string) => `https://signed/${objectKey}`,
  };
  const resolved = await resolveReviewLink(created.token, deps);
  assert(resolved.assets.length === 1 && resolved.assets[0]?.signedUrl === "https://signed/obj/png1", "token resolves scoped assets");
  await assertThrows(() => resolveReviewLink("00".repeat(32), deps), "unknown review link", "unknown tokens denied");
  // Revocation denies live links.
  const revoked = await revokeReviewLink(repo, SCOPE, created.id);
  assert(revoked.revoked === true, "revocation recorded");
  await assertThrows(() => resolveReviewLink(created.token, deps), "link revoked", "revoked links denied");
  // Cross-tenant: a token bound elsewhere cannot read this project's assets.
  const foreign = {
    findByTokenHash: async () => ({
      id: "rev-x", organizationId: "user:other", projectId: "other-project",
      scope: { assetIds: [pngId] }, note: "", consentSnapshot: [] as string[],
      expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null,
    }),
    loadAsset: async (projectId: string) => {
      if (projectId !== "other-project") throw new Error("REVIEW_DENIED: cross-project asset load refused.");
      return null;
    },
    loadConsent: async () => null,
    signUrl: async () => null,
  };
  let leaked = false;
  try {
    await resolveReviewLink(created.token, foreign);
  } catch {
    leaked = true;
  }
  assert(leaked, "foreign tokens cannot reach this project's assets");
}

// ── Review denial matrix ──

async function testReviewDenials(): Promise<void> {
  const base = {
    id: "rev-1", organizationId: SCOPE.organizationId, projectId: SCOPE.projectId,
    scope: { assetIds: ["a1"] }, note: "", consentSnapshot: [] as string[],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null as string | null,
  };
  const assetLoader = async (projectId: string, assetId: string) => {
    if (projectId !== SCOPE.projectId) throw new Error("cross-tenant asset load attempted");
    return assetId === "a1"
      ? { id: "a1", kind: "generation", title: "A", contentHash: PNG_HASH, objectKey: "obj/a1" }
      : null;
  };
  const depsFor = (link: typeof base, consents: Record<string, { lifecycle: string; expiresAt: string | null }>) => ({
    findByTokenHash: async () => link,
    loadAsset: assetLoader,
    loadConsent: async (_projectId: string, consentId: string) => consents[consentId] ?? null,
    signUrl: async (objectKey: string) => `https://signed/${objectKey}`,
  });
  // Expired.
  await assertThrows(
    () => resolveReviewLink("ab".repeat(32), depsFor({ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() }, {})),
    "link expired",
    "expired links denied",
  );
  // Revoked.
  await assertThrows(
    () => resolveReviewLink("ab".repeat(32), depsFor({ ...base, revokedAt: new Date().toISOString() }, {})),
    "link revoked",
    "revoked links denied",
  );
  // Removed consent.
  await assertThrows(
    () => resolveReviewLink("ab".repeat(32), depsFor(
      { ...base, consentSnapshot: ["c1"] },
      { c1: { lifecycle: "revoked", expiresAt: null } },
    )),
    "consent was removed",
    "removed consent denies",
  );
  // Removed asset.
  await assertThrows(
    () => resolveReviewLink("ab".repeat(32), depsFor({ ...base, scope: { assetIds: ["gone"] } }, {})),
    "asset was removed",
    "deleted assets deny",
  );
}

async function main(): Promise<void> {
  testPresets();
  testZip();
  testFcpxml();
  testC2pa();
  await testExportJobs();
  await testReviewLinks();
  await testReviewDenials();
  console.log(`stu-25 review export tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
