import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  assertSafeFetchUrl,
  MEDIA_ERROR_STATUS,
  MediaError,
  MEDIA_MAX_BYTES,
  type IngestDescriptor,
} from "@ethen/studio-core/server/media";
import type { AssetKind } from "@ethen/studio-core/contracts";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { claimMediaProcess } from "../../_lib/supabase-media";

export const dynamic = "force-dynamic";

const MEDIA_TYPES: ReadonlySet<string> = new Set(["image", "video", "audio"]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * STUDIO_07 — V1 ingest adapter. Authenticates, resolves scope, validates
 * the IngestDescriptor synchronously (expiry + SSRF literals + declared
 * size), then claims an idempotent process row. Bytes move in the
 * studio-worker media-cpu queue — this route never fetches or stores media.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const sourceUrl = asString(body.sourceUrl);
    const mediaType = asString(body.mediaType);
    const mimeType = asString(body.mimeType);
    const idempotencyKey = asString(body.idempotencyKey);
    if (!sourceUrl || !mediaType || !mimeType || !idempotencyKey) {
      return studioError("VALIDATION_ERROR", "sourceUrl, mediaType, mimeType, and idempotencyKey are required.");
    }
    if (!MEDIA_TYPES.has(mediaType)) {
      return studioError("VALIDATION_ERROR", "mediaType must be image, video, or audio.");
    }
    const expiresAt = asNullableString(body.expiresAt);
    if (expiresAt !== null) {
      const parsed = Date.parse(expiresAt);
      if (!Number.isFinite(parsed)) return studioError("VALIDATION_ERROR", "expiresAt is not a valid timestamp.");
      if (parsed <= Date.now()) {
        return studioError("VALIDATION_ERROR", "Provider URL already expired; re-request the output.");
      }
    }
    try {
      assertSafeFetchUrl(sourceUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Source URL is not permitted.";
      return studioError("FORBIDDEN", message);
    }
    const expectedByteSize: unknown = (body as Record<string, unknown>).expectedByteSize;
    if (expectedByteSize !== undefined && expectedByteSize !== null) {
      if (typeof expectedByteSize !== "number" || !Number.isInteger(expectedByteSize) || expectedByteSize <= 0) {
        return studioError("VALIDATION_ERROR", "expectedByteSize must be a positive integer.");
      }
      if (expectedByteSize > MEDIA_MAX_BYTES[mediaType as AssetKind]) {
        return studioError("VALIDATION_ERROR", "Declared media size exceeds the ingest limit.");
      }
    }
    const descriptor: IngestDescriptor = {
      sourceUrl,
      expiresAt,
      expectedSha256: asNullableString(body.expectedSha256),
      expectedByteSize: typeof expectedByteSize === "number" ? expectedByteSize : null,
      mediaType: mediaType as AssetKind,
      mimeType,
      idempotencyKey,
    };
    const claimed = await claimMediaProcess(resolved, {
      idempotencyKey: descriptor.idempotencyKey,
      sourceUrl: descriptor.sourceUrl,
      expiresAt: descriptor.expiresAt,
    });
    return studioSuccess(
      { processId: claimed.processId, stage: claimed.stage, replayed: claimed.replayed },
      undefined,
      claimed.replayed ? 200 : 202,
    );
  } catch (error) {
    const setup = setupRequiredResponse(error, "Media needs the Studio data service.");
    if (setup) return setup;
    if (error instanceof MediaError) {
      const status = MEDIA_ERROR_STATUS[error.code] ?? 500;
      void status;
      return studioError("INTERNAL_ERROR", error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Ingest claim failed.");
  }
}
