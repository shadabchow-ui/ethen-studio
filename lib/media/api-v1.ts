import "server-only";

export const STUDIO_API_VERSION = "2026-08-02" as const;
export const STUDIO_API_MAX_BODY_BYTES = 1_048_576;
export const STUDIO_API_MAX_PAGE_SIZE = 100;

export const STUDIO_ERROR_CODES = [
  "VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "SETUP_REQUIRED", "PROVIDER_UNAVAILABLE",
  "PROVIDER_LOCKED", "INSUFFICIENT_CREDITS", "RATE_LIMITED", "CONSENT_REQUIRED", "APPROVAL_REQUIRED",
  "MODERATION_BLOCKED", "TIMEOUT", "CONFLICT", "NOT_FOUND", "INTERNAL_ERROR",
] as const;
export type StudioErrorCode = (typeof STUDIO_ERROR_CODES)[number];

export interface StudioApiError { ok: false; error: { code: StudioErrorCode; message: string; requestId: string; details?: Readonly<Record<string, unknown>> }; }
export interface StudioApiSuccess<T> { ok: true; data: T; apiVersion: typeof STUDIO_API_VERSION; requestId: string; }
export interface StudioApiScope { organizationId: string; projectId: string; actorId: string; enrollmentId: string; readinessVersion: string; }
export interface StudioPagination { limit: number; cursor: string | null; sort: "created_at" | "updated_at"; direction: "asc" | "desc"; }
export interface StudioGenerationSubmission { idempotencyKey: string; providerId: string; adapterVersion: string; modelId: string; capability: string; policyVersion: string; immutableInput: Readonly<Record<string, unknown>>; sourceAssetIds: readonly string[]; }

const STATUS_BY_CODE: Record<StudioErrorCode, number> = { VALIDATION_ERROR: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, SETUP_REQUIRED: 503, PROVIDER_UNAVAILABLE: 503, PROVIDER_LOCKED: 409, INSUFFICIENT_CREDITS: 402, RATE_LIMITED: 429, CONSENT_REQUIRED: 422, APPROVAL_REQUIRED: 422, MODERATION_BLOCKED: 422, TIMEOUT: 504, CONFLICT: 409, NOT_FOUND: 404, INTERNAL_ERROR: 500 };

export function studioError(code: StudioErrorCode, message: string, requestId = crypto.randomUUID(), details?: Readonly<Record<string, unknown>>): Response {
  const error = details === undefined ? { code, message, requestId } : { code, message, requestId, details };
  return Response.json({ ok: false, error } satisfies StudioApiError, { status: STATUS_BY_CODE[code], headers: { "X-Studio-Api-Version": STUDIO_API_VERSION, "Cache-Control": "no-store" } });
}

export function studioSuccess<T>(data: T, requestId = crypto.randomUUID(), status = 200): Response {
  return Response.json({ ok: true, data, apiVersion: STUDIO_API_VERSION, requestId } satisfies StudioApiSuccess<T>, { status, headers: { "X-Studio-Api-Version": STUDIO_API_VERSION, "Cache-Control": "no-store" } });
}

export function parseStudioPagination(url: URL): StudioPagination {
  const rawLimit = url.searchParams.get("limit"); const limit = rawLimit === null ? 25 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > STUDIO_API_MAX_PAGE_SIZE) throw new StudioApiContractError("VALIDATION_ERROR", `limit must be an integer from 1 to ${STUDIO_API_MAX_PAGE_SIZE}`);
  const sort = url.searchParams.get("sort") ?? "created_at"; const direction = url.searchParams.get("direction") ?? "desc";
  if (sort !== "created_at" && sort !== "updated_at") throw new StudioApiContractError("VALIDATION_ERROR", "sort must be created_at or updated_at");
  if (direction !== "asc" && direction !== "desc") throw new StudioApiContractError("VALIDATION_ERROR", "direction must be asc or desc");
  const cursor = url.searchParams.get("cursor"); if (cursor && (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor))) throw new StudioApiContractError("VALIDATION_ERROR", "cursor is invalid");
  return { limit, cursor, sort, direction };
}

export function requireStudioIdempotency(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new StudioApiContractError("VALIDATION_ERROR", "Idempotency-Key must be 8-128 URL-safe characters");
  return key;
}

export async function readStudioJson(request: Request): Promise<Readonly<Record<string, unknown>>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > STUDIO_API_MAX_BODY_BYTES) throw new StudioApiContractError("VALIDATION_ERROR", "Request body exceeds Studio API limit");
  const body = await request.text(); if (new TextEncoder().encode(body).byteLength > STUDIO_API_MAX_BODY_BYTES) throw new StudioApiContractError("VALIDATION_ERROR", "Request body exceeds Studio API limit");
  try { const parsed: unknown = JSON.parse(body); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(); return parsed as Record<string, unknown>; } catch { throw new StudioApiContractError("VALIDATION_ERROR", "Expected a JSON object"); }
}

/** Routes must supply this from a verified auth/enrollment/readiness resolver; it rejects partial context. */
export function assertStudioApiScope(scope: StudioApiScope | null): StudioApiScope {
  if (!scope) throw new StudioApiContractError("UNAUTHORIZED", "Authenticated Studio context is required");
  for (const [key, value] of Object.entries(scope)) if (!value?.trim()) throw new StudioApiContractError(key === "enrollmentId" || key === "readinessVersion" ? "SETUP_REQUIRED" : "FORBIDDEN", `Studio ${key} is required`);
  return Object.freeze({ ...scope });
}

/** Avoid exposing provider URLs, object keys, credentials, or arbitrary error details in API responses. */
export function redactStudioApiValue(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/https?:\/\/[^\s]+/gi, "[redacted-url]").replace(/(token|secret|signature|key)=?[^\s,&]+/gi, "$1=[redacted]");
  if (Array.isArray(value)) return value.map(redactStudioApiValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => /token|secret|signature|private.?key/i.test(key) ? [key, "[redacted]"] : [key, redactStudioApiValue(item)]));
  return value;
}

export class StudioApiContractError extends Error { constructor(readonly code: StudioErrorCode, message: string) { super(message); this.name = "StudioApiContractError"; } }

export function studioApiFailure(error: unknown, requestId = crypto.randomUUID()): Response {
  if (error instanceof StudioApiContractError) return studioError(error.code, error.message, requestId);
  return studioError("INTERNAL_ERROR", "Studio API request failed", requestId);
}
