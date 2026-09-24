import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import {
  assertIdempotencyKeyShape,
  buildIdempotencyRecord,
  compareIdempotency,
  createMemoryGatewayStore,
  MemoryRateLimiter,
} from "@ethen/studio-core/server/gateway";
import { requireSessionTenant, gatewayFailure } from "../../_lib/gateway-auth";
import { SupabaseGatewayStore } from "../../_lib/supabase-gateway";

export const dynamic = "force-dynamic";

const limiter = new MemoryRateLimiter();
const fallbackIdempotency = createMemoryGatewayStore();

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((v) => typeof v === "string" && v.trim().length > 0)) return null;
  return value as string[];
}

/**
 * STUDIO_19 — V1 gateway key management. GET lists key metadata for the
 * caller's tenant (never secrets). POST mints a scoped key and reveals
 * the secret exactly once in the creation response.
 */
export async function GET(): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const store = new SupabaseGatewayStore();
    const keys = await store.listKeys(tenant.session.tenantId);
    return studioSuccess({ state: keys.length === 0 ? "empty" : "ready", keys, total: keys.length });
  } catch (error) {
    return gatewayFailure(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const tenant = await requireSessionTenant();
    if ("response" in tenant) return tenant.response;
    const { actorId, tenantId } = tenant.session;
    limiter.assertAllowed({ subject: `actor:${actorId}`, route: "keys" });
    const body = await readStudioJson(request);
    const name = typeof body.name === "string" ? body.name : "";
    const projects = asStringArray(body.projects);
    const tasks = asStringArray(body.tasks);
    const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : null;
    if (!name.trim()) return studioError("VALIDATION_ERROR", "name is required.");
    if (!projects) return studioError("VALIDATION_ERROR", "projects must be a non-empty string array.");
    if (!tasks) return studioError("VALIDATION_ERROR", "tasks must be a non-empty string array.");
    const headerKey = request.headers.get("idempotency-key")?.trim() || null;
    const store = new SupabaseGatewayStore();
    const scopeKey = `keys:${tenantId}`;
    if (headerKey) {
      assertIdempotencyKeyShape(headerKey);
      let stored = null;
      try {
        stored = await store.readIdempotency(scopeKey, headerKey);
      } catch {
        stored = await fallbackIdempotency.readIdempotency(scopeKey, headerKey);
      }
      const outcome = compareIdempotency(stored, JSON.stringify({ name, projects, tasks, expiresAt }));
      if (outcome.kind === "replay") {
        return studioSuccess(outcome.record.response, undefined, outcome.record.statusCode);
      }
      if (outcome.kind === "conflict") {
        return studioError("CONFLICT", "Idempotency key was already used with a different payload.");
      }
    }
    const created = fallbackIdempotency.createKey({
      tenantId,
      name,
      scope: { projects, tasks },
      createdBy: actorId,
      expiresAt,
    });
    await store.insertKey(created.record);
    const payload = { key: created.metadata, secret: created.secret };
    if (headerKey) {
      const record = buildIdempotencyRecord({
        key: headerKey,
        requestHash: JSON.stringify({ name, projects, tasks, expiresAt }),
        statusCode: 201,
        response: { key: created.metadata, replayedSecret: false },
      });
      try {
        await store.writeIdempotency(scopeKey, record);
      } catch {
        await fallbackIdempotency.writeIdempotency(scopeKey, record);
      }
    }
    return studioSuccess(payload, undefined, 201);
  } catch (error) {
    return gatewayFailure(error);
  }
}
