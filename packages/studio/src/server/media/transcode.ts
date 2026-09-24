/** Studio V5 media — proxies, thumbnails, waveforms, SDR renders (STUDIO_07). */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";
import { mediaError } from "./types";
import type { DerivativeKind, DerivativeRecord } from "./types";

/** Default derivative lifecycle: 30 days. Sources are never expired by this path. */
export const PROXY_RETENTION_DAYS = 30;
export const PROXY_RETENTION_MS = PROXY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** V1 render color contract: SDR/BT.709 only. HDR/wide-gamut finishing is POST-V1. */
export const RENDER_COLOR_SPACE = "BT.709" as const;
export const RENDER_TRANSFER = "SDR" as const;

export interface ProxySpec {
  kind: Extract<DerivativeKind, "proxy" | "thumbnail" | "waveform">;
  /** Max long-edge pixels for proxy/thumbnail; peaks-per-second for waveform. */
  target: number;
  mimeType: string;
}

export const DEFAULT_PROXY_SPECS: Readonly<Record<string, ProxySpec>> = {
  "video-proxy": { kind: "proxy", target: 720, mimeType: "video/mp4" },
  "image-thumbnail": { kind: "thumbnail", target: 512, mimeType: "image/jpeg" },
  "video-thumbnail": { kind: "thumbnail", target: 512, mimeType: "image/jpeg" },
  "audio-waveform": { kind: "waveform", target: 100, mimeType: "application/json" },
};

export interface RenderSpec {
  width: number;
  height: number;
  fps: number;
  colorSpace: typeof RENDER_COLOR_SPACE;
  transfer: typeof RENDER_TRANSFER;
  videoCodec: "h264";
  audioCodec: "aac" | "none";
}

const SUPPORTED_RENDER_FPS = new Set([24, 25, 30, 60]);

/** Validate a V1 render spec: SDR/BT.709 pinned, supported frame rates only. */
export function validateRenderSpec(candidate: unknown): RenderSpec {
  const fail = (message: string, details: Readonly<Record<string, unknown>> = {}): never => {
    throw mediaError("BAD_REQUEST", message, { ...details, contract: "RenderSpec" });
  };
  if (!candidate || typeof candidate !== "object") fail("Render spec must be an object.");
  const spec = candidate as Record<string, unknown>;
  if (spec.colorSpace !== RENDER_COLOR_SPACE || spec.transfer !== RENDER_TRANSFER) {
    fail("V1 renders are SDR/BT.709 only.", { colorSpace: spec.colorSpace, transfer: spec.transfer });
  }
  if (!Number.isInteger(spec.width) || (spec.width as number) <= 0 || (spec.width as number) > 3840) {
    fail("Render width must be an integer within (0, 3840].", {});
  }
  if (!Number.isInteger(spec.height) || (spec.height as number) <= 0 || (spec.height as number) > 2160) {
    fail("Render height must be an integer within (0, 2160].", {});
  }
  if (typeof spec.fps !== "number" || !SUPPORTED_RENDER_FPS.has(spec.fps)) {
    fail("Render fps must be one of 24, 25, 30, 60.", { fps: spec.fps });
  }
  if (spec.videoCodec !== "h264") fail("V1 render video codec is h264.", { videoCodec: spec.videoCodec });
  if (spec.audioCodec !== "aac" && spec.audioCodec !== "none") {
    fail("V1 render audio codec is aac or none.", { audioCodec: spec.audioCodec });
  }
  return candidate as RenderSpec;
}

/** Validate a proxy/thumbnail/waveform spec. */
export function validateProxySpec(candidate: unknown): ProxySpec {
  const fail = (message: string): never => {
    throw mediaError("BAD_REQUEST", message, { contract: "ProxySpec" });
  };
  if (!candidate || typeof candidate !== "object") fail("Proxy spec must be an object.");
  const spec = candidate as Record<string, unknown>;
  if (spec.kind !== "proxy" && spec.kind !== "thumbnail" && spec.kind !== "waveform") {
    fail("Proxy spec kind must be proxy, thumbnail, or waveform.");
  }
  if (!Number.isInteger(spec.target) || (spec.target as number) <= 0) {
    fail("Proxy spec target must be a positive integer.");
  }
  if (typeof spec.mimeType !== "string" || spec.mimeType.length === 0) fail("Proxy spec mimeType is required.");
  return candidate as ProxySpec;
}

export interface DerivativeBuildInput {
  scope: ProjectScope;
  assetId: string;
  version: number;
  kind: DerivativeKind;
  spec: Readonly<Record<string, unknown>>;
  storageKey: string;
  sha256: string;
  byteSize: number;
  toolVersions: Readonly<Record<string, string>>;
  createdAt: string;
}

/**
 * Build a derivative record. Proxies/thumbnails/waveforms get a 30-day
 * expiry; renders are retained (explicit retention, never the proxy sweep).
 * Sources are never passed here — the proxy lifecycle cannot delete them.
 */
export function buildDerivativeRecord(input: DerivativeBuildInput): DerivativeRecord {
  if (!/^[0-9a-f]{64}$/i.test(input.sha256)) {
    throw mediaError("BAD_REQUEST", "Derivative sha256 must be a 64-hex digest.", {});
  }
  if (Object.keys(input.toolVersions).length === 0) {
    throw mediaError("BAD_REQUEST", "Derivative tool versions must be recorded.", {});
  }
  const createdMs = Date.parse(input.createdAt);
  if (!Number.isFinite(createdMs)) throw mediaError("BAD_REQUEST", "Derivative createdAt is invalid.", {});
  const expiresAt =
    input.kind === "render" ? null : new Date(createdMs + PROXY_RETENTION_MS).toISOString();
  return {
    derivativeId: `${input.assetId}:v${input.version}:${input.kind}`,
    scope: input.scope,
    assetId: input.assetId,
    version: input.version,
    kind: input.kind,
    spec: input.spec,
    storageKey: input.storageKey,
    sha256: input.sha256,
    byteSize: input.byteSize,
    toolVersions: input.toolVersions,
    createdAt: input.createdAt,
    expiresAt,
    expiredAt: null,
  };
}

/** True when a derivative is past its expiry (renders never expire). */
export function isDerivativeExpired(record: DerivativeRecord, nowIso?: string): boolean {
  if (record.kind === "render" || record.expiresAt === null) return false;
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  return Number.isFinite(now) && Date.parse(record.expiresAt) <= now;
}

/**
 * Expire due derivatives. Returns the ids that transitioned to expired.
 * Pure over records; the caller persists and deletes bytes.
 */
export function expireDerivatives(
  records: readonly DerivativeRecord[],
  nowIso: string,
): { expiredIds: string[]; live: DerivativeRecord[] } {
  const expiredIds: string[] = [];
  const live: DerivativeRecord[] = [];
  for (const record of records) {
    if (record.expiredAt === null && isDerivativeExpired(record, nowIso)) {
      expiredIds.push(record.derivativeId);
    } else {
      live.push(record);
    }
  }
  return { expiredIds, live };
}
