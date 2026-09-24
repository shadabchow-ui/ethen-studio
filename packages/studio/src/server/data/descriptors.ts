/** Studio V5 data — authorized descriptors + signed-delivery hook (STUDIO_02). */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";
import { dataError } from "./types";
import type { MediaDescriptor } from "./types";
import type { AssetRepository } from "./assets";

const SERVABLE_STATES = new Set(["CUSTODY", "AVAILABLE"]);

/**
 * Authorized media descriptor query. Scope membership is proven through the
 * repository; only custodied versions describe, and the descriptor carries an
 * owned storage key — never a provider URL.
 */
export async function authorizeDescriptor(
  assets: AssetRepository,
  scope: ProjectScope,
  assetId: string,
  version?: number,
): Promise<MediaDescriptor> {
  const record = await assets.getAsset(scope, assetId);
  if (!record) throw dataError("NOT_FOUND", "Asset not found in this project scope.", { assetId });
  if (record.tombstonedAt !== null) {
    throw dataError("NOT_FOUND", "Asset is tombstoned; only its receipt is retained.", { assetId });
  }
  let resolved = version;
  if (resolved === undefined) {
    const page = await assets.listVersions(scope, assetId, { cursor: null, limit: 1 });
    resolved = page.items[0]?.version;
  }
  if (resolved === undefined) throw dataError("NOT_FOUND", "Asset has no versions.", { assetId });
  const assetVersion = await assets.getVersion(scope, assetId, resolved);
  if (!assetVersion) throw dataError("NOT_FOUND", "Asset version not found.", { assetId, version: resolved });
  if (!SERVABLE_STATES.has(assetVersion.processingState)) {
    throw dataError("FORBIDDEN", `Version is not servable while ${assetVersion.processingState}.`, {
      assetId,
      version: resolved,
      processingState: assetVersion.processingState,
    });
  }
  return {
    assetId,
    version: resolved,
    scope: { ...scope },
    kind: record.kind,
    filename: record.filename,
    storageKey: assetVersion.storageKey,
    sha256: assetVersion.sha256,
    byteSize: assetVersion.byteSize,
    mediaMetadata: assetVersion.mediaMetadata,
    processingState: assetVersion.processingState,
  };
}

/** Signed-delivery capability minted after authorization. Not persisted. */
export interface DeliveryGrant {
  descriptor: MediaDescriptor;
  url: string;
  expiresAt: string;
}

/** Storage-specific signer port; implemented by the delivery adapter. */
export interface SignedDeliveryPort {
  sign(descriptor: MediaDescriptor, ttlSeconds: number): Promise<{ url: string; expiresAt: string }>;
}

/**
 * Re-authorize on every delivery request, then sign a short-lived URL. The URL
 * is a delivery capability only — callers must never persist it as the asset.
 */
export async function requestDelivery(
  port: SignedDeliveryPort,
  assets: AssetRepository,
  scope: ProjectScope,
  assetId: string,
  version: number | undefined,
  ttlSeconds: number,
): Promise<DeliveryGrant> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 3600) {
    throw dataError("BAD_REQUEST", "ttlSeconds must be an integer in (0, 3600].");
  }
  const descriptor = await authorizeDescriptor(assets, scope, assetId, version);
  const grant = await port.sign(descriptor, ttlSeconds);
  if (!grant.url?.trim() || !grant.expiresAt?.trim()) {
    throw dataError("INTERNAL", "Delivery signer returned an empty grant.");
  }
  return { descriptor, url: grant.url, expiresAt: grant.expiresAt };
}
