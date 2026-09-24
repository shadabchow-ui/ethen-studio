/** Studio V5 media — export packages and protected downloads (STUDIO_07). */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { ProjectScope } from "../../contracts/scope";
import type { PolicyAction } from "../../contracts/policy";
import { mediaError } from "./types";

/** Versioned V1 export presets. Every export pins preset name + version. */
export const MEDIA_EXPORT_PRESETS = Object.freeze({
  "source-package": { version: "1.0.0", description: "Original bytes plus manifest." },
  "review-package": { version: "1.0.0", description: "Proxies plus manifest for review." },
  "delivery-mp4": { version: "1.0.0", description: "SDR/BT.709 h264/aac render plus manifest." },
  "interchange-otio": { version: "1.0.0", description: "OTIO timeline plus manifest." },
  "interchange-fcpxml": { version: "1.0.0", description: "FCPXML timeline plus manifest." },
});

export type MediaExportPreset = keyof typeof MEDIA_EXPORT_PRESETS;

export function assertMediaExportPreset(preset: string): asserts preset is MediaExportPreset {
  if (!Object.prototype.hasOwnProperty.call(MEDIA_EXPORT_PRESETS, preset)) {
    throw mediaError("BAD_REQUEST", `Export preset '${preset}' is not an advertised V1 export.`, { preset });
  }
}

export interface ExportPinnedInput {
  assetId: string;
  version: number;
  kind: string;
  contentHash: string;
}

export interface ExportPlanInput {
  scope: ProjectScope;
  preset: MediaExportPreset;
  title: string;
  inputs: readonly ExportPinnedInput[];
  /** Rights snapshot ids pinned per input (j03 assertions). */
  rightsSnapshotIds: Readonly<Record<string, string>>;
  /** Lineage edges carried into the package. */
  lineage: ReadonlyArray<{ parentAssetId: string; parentVersion: number; childAssetId: string; childVersion: number; transform: string }>;
  /** Identity bundle references carried into the package (j10 shape, opaque here). */
  identityRefs: ReadonlyArray<{ identityId: string; identityVersion: number | null }>;
  actorId: string;
  idempotencyKey: string;
}

export interface ExportManifestFile {
  name: string;
  bytes: number;
  sha256: string;
}

/** Canonical STUDIO_07 Render/ExportManifest. */
export interface MediaExportManifest {
  exportId: string;
  preset: MediaExportPreset;
  presetVersion: string;
  title: string;
  scope: ProjectScope;
  inputs: readonly ExportPinnedInput[];
  rightsSnapshotIds: Readonly<Record<string, string>>;
  lineage: ExportPlanInput["lineage"];
  identityRefs: ExportPlanInput["identityRefs"];
  /** Policy decision that authorized this exact export (re-checked at build). */
  decisionId: string;
  interchangeWarnings: readonly string[];
  files: readonly ExportManifestFile[];
  manifestHash: string;
  exportedAt: string;
}

/** Policy re-check port: exports re-authorize at build time, never trust plan time. */
export interface ExportPolicyPort {
  check(input: {
    scope: ProjectScope;
    actorId: string;
    action: PolicyAction;
    assetId: string;
    assetVersion: number | null;
    assetClass: string;
    now?: string;
  }): Promise<{ allowed: boolean; reasonCode: string; decisionId: string; remediation: string | null }>;
}

export interface ExportBuildDeps {
  policy: ExportPolicyPort;
  /** Fetch exact input bytes for packaging (owned storage only). */
  fetchBytes(input: ExportPinnedInput): Promise<Uint8Array>;
  storeBytes(input: { scope: ProjectScope; actorId: string; bytes: Uint8Array; contentType: string; filename: string; idempotencyKey: string }): Promise<{ objectKey: string }>;
  now?: string;
}

function manifestHashOf(manifest: Omit<MediaExportManifest, "manifestHash" | "exportedAt">): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

/**
 * Build an export package. Re-checks policy for EVERY input at build time:
 * a right revoked between plan and build aborts the export with
 * POLICY_DENIED — partial packages are never shipped. Idempotent per
 * (scope, idempotencyKey) via the caller-provided store.
 */
export async function buildExportPackage(
  plan: ExportPlanInput,
  deps: ExportBuildDeps,
  opts?: { interchangeWarnings?: readonly string[] },
): Promise<{ manifest: MediaExportManifest; objectKey: string; replayed: boolean }> {
  if (plan.inputs.length === 0) throw mediaError("BAD_REQUEST", "Export needs at least one pinned input.", {});
  for (const input of plan.inputs) {
    if (!/^[0-9a-f]{64}$/i.test(input.contentHash)) {
      throw mediaError("BAD_REQUEST", "Export inputs must pin exact content hashes.", { assetId: input.assetId });
    }
    if (!Number.isInteger(input.version) || input.version <= 0) {
      throw mediaError("BAD_REQUEST", "Export inputs must pin exact asset versions.", { assetId: input.assetId });
    }
    const verdict = await deps.policy.check({
      scope: plan.scope,
      actorId: plan.actorId,
      action: "export",
      assetId: input.assetId,
      assetVersion: input.version,
      assetClass: input.kind,
      now: deps.now,
    });
    if (!verdict.allowed) {
      throw mediaError("POLICY_DENIED", `Export blocked for ${input.assetId} v${input.version}: ${verdict.reasonCode}.`, {
        assetId: input.assetId,
        version: input.version,
        reasonCode: verdict.reasonCode,
        decisionId: verdict.decisionId,
        remediation: verdict.remediation,
      });
    }
  }
  // All inputs authorized at build time: the last decision authorizes the package.
  const packageCheck = await deps.policy.check({
    scope: plan.scope,
    actorId: plan.actorId,
    action: "export",
    assetId: plan.inputs[0].assetId,
    assetVersion: plan.inputs[0].version,
    assetClass: "package",
    now: deps.now,
  });
  if (!packageCheck.allowed) {
    throw mediaError("POLICY_DENIED", `Export package blocked: ${packageCheck.reasonCode}.`, {
      reasonCode: packageCheck.reasonCode,
      decisionId: packageCheck.decisionId,
    });
  }
  const files: ExportManifestFile[] = [];
  for (const input of plan.inputs) {
    const bytes = await deps.fetchBytes(input);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest.toLowerCase() !== input.contentHash.toLowerCase()) {
      throw mediaError("CONFLICT", "Stored bytes no longer match the pinned export input.", {
        assetId: input.assetId,
        version: input.version,
      });
    }
    files.push({ name: `${input.assetId}-v${input.version}`, bytes: bytes.byteLength, sha256: digest });
  }
  const exportId = randomUUID();
  const presetVersion = MEDIA_EXPORT_PRESETS[plan.preset].version;
  const unsigned = {
    exportId,
    preset: plan.preset,
    presetVersion,
    title: plan.title,
    scope: plan.scope,
    inputs: plan.inputs,
    rightsSnapshotIds: plan.rightsSnapshotIds,
    lineage: plan.lineage,
    identityRefs: plan.identityRefs,
    decisionId: packageCheck.decisionId,
    interchangeWarnings: opts?.interchangeWarnings ?? [],
    files,
  };
  const manifest: MediaExportManifest = {
    ...unsigned,
    manifestHash: manifestHashOf(unsigned),
    exportedAt: deps.now ?? new Date().toISOString(),
  };
  const stored = await deps.storeBytes({
    scope: plan.scope,
    actorId: plan.actorId,
    bytes: new TextEncoder().encode(JSON.stringify({ manifest })),
    contentType: "application/json",
    filename: `export-${exportId}.json`,
    idempotencyKey: plan.idempotencyKey,
  });
  return { manifest, objectKey: stored.objectKey, replayed: false };
}

/** Single-use protected-download grant. Every download needs a fresh decision. */
export interface ProtectedDownloadGrant {
  grantId: string;
  scope: ProjectScope;
  assetId: string;
  version: number;
  contentHash: string;
  url: string;
  expiresAt: string;
  maxUses: 1;
  decisionId: string;
  explicitDownload: true;
}

export interface DownloadDeps {
  policy: ExportPolicyPort;
  sign(input: { scope: ProjectScope; assetId: string; version: number; ttlSeconds: number }): Promise<{ url: string; expiresAt: string }>;
  now?: string;
}

/**
 * Mint a protected download: fresh policy decision per download, content-hash
 * pinned, single-use, short-lived. The locator shape matches the
 * studio-preview-delivery consumer contract (delivery access).
 */
export async function grantProtectedDownload(
  input: { scope: ProjectScope; actorId: string; assetId: string; version: number; assetClass: string; contentHash: string; ttlSeconds: number },
  deps: DownloadDeps,
): Promise<ProtectedDownloadGrant> {
  if (!/^[0-9a-f]{64}$/i.test(input.contentHash)) {
    throw mediaError("BAD_REQUEST", "Protected downloads require a pinned sha256 content hash.", {});
  }
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds <= 0 || input.ttlSeconds > 3600) {
    throw mediaError("BAD_REQUEST", "Download ttlSeconds must be an integer in (0, 3600].", {});
  }
  const verdict = await deps.policy.check({
    scope: input.scope,
    actorId: input.actorId,
    action: "download",
    assetId: input.assetId,
    assetVersion: input.version,
    assetClass: input.assetClass,
    now: deps.now,
  });
  if (!verdict.allowed) {
    throw mediaError("POLICY_DENIED", `Download blocked: ${verdict.reasonCode}.`, {
      reasonCode: verdict.reasonCode,
      decisionId: verdict.decisionId,
      remediation: verdict.remediation,
    });
  }
  const signed = await deps.sign({ scope: input.scope, assetId: input.assetId, version: input.version, ttlSeconds: input.ttlSeconds });
  return {
    grantId: randomUUID(),
    scope: input.scope,
    assetId: input.assetId,
    version: input.version,
    contentHash: input.contentHash,
    url: signed.url,
    expiresAt: signed.expiresAt,
    maxUses: 1,
    decisionId: verdict.decisionId,
    explicitDownload: true,
  };
}
