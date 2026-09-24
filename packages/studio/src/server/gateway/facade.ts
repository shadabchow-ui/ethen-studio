/** Studio V5 gateway — authenticated facade over the shared kernel (STUDIO_19). Server-only. */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";
import type { TaskName } from "../../contracts/tasks";
import type { MemoryEconomicsStore } from "../economics/memory";
import { admitJob, type AdmissionRequest, type AdmissionResult } from "../runtime/admission";
import type { RuntimeRepository } from "../runtime/memory";
import {
  assertIdempotencyKeyShape,
  buildIdempotencyRecord,
  compareIdempotency,
  type IdempotencyOutcome,
} from "./idempotency";
import { assertKeyScope, assertKeyUsable, hashApiKeySecret } from "./keys";
import { MemoryRateLimiter } from "./rate-limit";
import {
  gatewayError,
  type ApiKeyRecord,
  type GatewayPrincipal,
  type IdempotencyRecord,
} from "./types";

/** Minimal store surface the facade needs; memory + Supabase both implement it. */
export interface GatewayAuthStore {
  findKeyByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  touchKeyUsed(keyId: string, nowIso: string): Promise<void>;
  readIdempotency(scopeKey: string, key: string): Promise<IdempotencyRecord | null>;
  writeIdempotency(scopeKey: string, record: IdempotencyRecord): Promise<void>;
}

export interface GatewayAdmissionDeps {
  runtime: RuntimeRepository;
  economics: MemoryEconomicsStore;
}

function scopeKeyFor(tenantId: string, projectId: string): string {
  return `${tenantId}:${projectId}`;
}

/**
 * Authenticate a Bearer API secret into a scoped principal. Unknown,
 * revoked, expired, or out-of-scope keys are rejected; key usage is
 * touched for audit. Session callers bypass this and supply their own
 * actor (routes own that branch).
 */
export async function authorizeWithKey(
  store: GatewayAuthStore,
  secret: string,
  input: { tenantId: string; projectId: string; task: TaskName | string; nowIso?: string },
): Promise<GatewayPrincipal> {
  const record = await store.findKeyByHash(hashApiKeySecret(secret));
  if (!record) {
    throw gatewayError("UNAUTHORIZED", "API key is invalid.");
  }
  assertKeyUsable(record, input.nowIso);
  assertKeyScope(record, input);
  const now = input.nowIso ?? new Date().toISOString();
  await store.touchKeyUsed(record.keyId, now);
  return {
    keyId: record.keyId,
    tenantId: record.tenantId,
    actorId: `api-key:${record.keyId}`,
    scope: record.scope,
    project: null,
  };
}

export interface GatewayAdmissionRequest extends AdmissionRequest {
  idempotencyScopeKey?: string;
}

const sharedLimiter = new MemoryRateLimiter();

export interface GatewayAdmissionResult extends AdmissionResult {
  idempotency: IdempotencyOutcome["kind"];
  rateLimit: { limit: number; remaining: number; resetAtMs: number };
}

/**
 * Gateway admission. Enforces rate limit → idempotency → key scope, then
 * calls exactly the same kernel `admitJob` the UI path uses — parity is
 * structural, not duplicated logic. No separate billing path exists.
 */
export async function admitThroughGateway(
  store: GatewayAuthStore,
  principal: GatewayPrincipal,
  scope: ProjectScope,
  request: Omit<GatewayAdmissionRequest, "scope" | "actorId">,
  deps: GatewayAdmissionDeps,
  opts?: { limiter?: MemoryRateLimiter; nowMs?: number; nowIso?: string },
): Promise<GatewayAdmissionResult> {
  const limiter = opts?.limiter ?? sharedLimiter;
  const rate = limiter.assertAllowed({
    subject: `key:${principal.keyId}`,
    route: "admit",
    nowMs: opts?.nowMs,
  });
  assertIdempotencyKeyShape(request.idempotencyKey);
  const tenantId = scope.tenantId;
  const projectId = scope.projectId;
  if (principal.tenantId !== tenantId) {
    throw gatewayError("FORBIDDEN", "API key is not valid for this tenant.");
  }
  const scopeKey = request.idempotencyScopeKey ?? scopeKeyFor(tenantId, projectId);
  const stored = await store.readIdempotency(scopeKey, request.idempotencyKey);
  const outcome = compareIdempotency(stored, request.requestHash);
  if (outcome.kind === "conflict") {
    // Surface the kernel's own conflict semantics for a changed payload.
    throw gatewayError("CONFLICT", "Idempotency key was already used with a different payload.", {
      key: request.idempotencyKey,
    });
  }
  const { idempotencyScopeKey: _ignoredScopeKey, ...kernelRequest } = request;
  void _ignoredScopeKey;
  const admitted = await admitJob({ ...kernelRequest, scope, actorId: principal.actorId }, deps);
  if (outcome.kind === "fresh") {
    await store.writeIdempotency(
      scopeKey,
      buildIdempotencyRecord({
        key: request.idempotencyKey,
        requestHash: request.requestHash,
        statusCode: 201,
        response: { jobId: admitted.job.jobId, replayed: admitted.replayed },
        nowIso: opts?.nowIso,
      }),
    );
  }
  return {
    ...admitted,
    idempotency: outcome.kind === "replay" ? "replay" : admitted.replayed ? "replay" : "fresh",
    rateLimit: { limit: rate.limit, remaining: rate.remaining, resetAtMs: rate.resetAtMs },
  };
}
