import "server-only";

/**
 * STUDIO_19 gateway authentication/middleware (apps/studio/app/api/studio/v1/_lib).
 * Resolves either a session actor (for key/webhook management) or a scoped
 * API-key principal (for facade admission), and maps GatewayError onto the
 * shared Studio API error envelope. Domain route owners retain their
 * handlers; this module owns only gateway auth + facade registration.
 */
import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, type StudioErrorCode } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  GatewayError,
  authorizeWithKey,
  hashApiKeySecret,
  keyMetadata,
  parseBearerSecret,
  type GatewayPrincipal,
} from "@ethen/studio-core/server/gateway";
import { resolveActorTenant, resolveProjectScope, type ResolvedScope } from "./supabase-data";
import { SupabaseGatewayStore } from "./supabase-gateway";

export function gatewayFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "The API gateway needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof GatewayError) {
    const code = gatewayStatusCode(error.code);
    return studioError(code, error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Gateway request failed.");
}

function gatewayStatusCode(code: GatewayError["code"]): StudioErrorCode {
  switch (code) {
    case "BAD_REQUEST":
      return "VALIDATION_ERROR";
    case "UNAUTHORIZED":
      return "UNAUTHORIZED";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "CONFLICT":
    case "QUOTE_CONFLICT":
      return "CONFLICT";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "UNSUPPORTED_TASK":
    case "SSRF_BLOCKED":
      return "VALIDATION_ERROR";
    case "DELIVERY_FAILED":
      return "PROVIDER_UNAVAILABLE";
    case "DEAD_LETTER":
      return "CONFLICT";
    case "INTERNAL":
    default:
      return "INTERNAL_ERROR";
  }
}

export interface SessionTenant {
  actorId: string;
  tenantId: string;
}

/** Session actor + tenant binding for key/webhook management routes. */
export async function requireSessionTenant(): Promise<
  { session: SessionTenant } | { response: Response }
> {
  const session = await requireUserSession();
  if (session.response) return { response: session.response };
  const actorId = session.actorId;
  if (!actorId) return { response: studioError("UNAUTHORIZED", "Authenticated actor is required.") };
  let tenantId: string | null;
  try {
    tenantId = await resolveActorTenant(actorId);
  } catch {
    return { response: studioError("SETUP_REQUIRED", "Tenant membership is unavailable.") };
  }
  if (!tenantId) {
    return { response: studioError("SETUP_REQUIRED", "No Studio tenant is bound to this actor yet.") };
  }
  return { session: { actorId, tenantId } };
}

export interface KeyPrincipal {
  principal: GatewayPrincipal;
  resolved: ResolvedScope;
  record: { keyId: string; name: string; prefix: string };
}

/**
 * Authenticate a facade request with a Bearer API key. Resolves the
 * project scope service-side (never trusts caller-supplied tenant) and
 * enforces key scope for the requested project + task.
 */
export async function requireKeyPrincipal(
  request: NextRequest,
  input: { projectId: string; task: string },
): Promise<KeyPrincipal | { response: Response }> {
  const secret = parseBearerSecret(request.headers.get("authorization"));
  if (!secret) {
    return { response: studioError("UNAUTHORIZED", "A Bearer Studio API key is required.") };
  }
  let resolved: ResolvedScope | null;
  try {
    resolved = await resolveProjectScope(input.projectId);
  } catch {
    return { response: studioError("SETUP_REQUIRED", "Project scope is unavailable.") };
  }
  if (!resolved) {
    return { response: studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.") };
  }
  const store = new SupabaseGatewayStore();
  try {
    const principal = await authorizeWithKey(store, secret, {
      tenantId: resolved.tenantId,
      projectId: input.projectId,
      task: input.task,
    });
    const record = await store.findKeyByHash(hashApiKeySecret(secret));
    return {
      principal: { ...principal, project: resolved.scope },
      resolved,
      record: record
        ? { keyId: record.keyId, name: record.name, prefix: record.prefix }
        : { keyId: principal.keyId, name: "", prefix: "" },
    };
  } catch (error) {
    return { response: gatewayFailure(error) };
  }
}

export interface EitherActor {
  kind: "key";
  key: KeyPrincipal;
  actorId: string;
  resolved: ResolvedScope;
  tenantId: string;
}

/**
 * Compatibility entry: API key when a Bearer secret is present, else the
 * session project authorization. Either way the caller reaches the same
 * kernel admission with an explicit actor + scope.
 */
export async function requireKeyOrSession(
  request: NextRequest,
  input: { projectId: string; task: string },
): Promise<EitherActor | { response: Response }> {
  const secret = parseBearerSecret(request.headers.get("authorization"));
  if (secret) {
    const keyed = await requireKeyPrincipal(request, input);
    if ("response" in keyed) return keyed;
    return {
      kind: "key",
      key: keyed,
      actorId: keyed.principal.actorId,
      resolved: keyed.resolved,
      tenantId: keyed.resolved.tenantId,
    };
  }
  const session = await requireUserSession();
  if (session.response) return { response: session.response };
  const authorization = await requireProject({ api: true, projectId: input.projectId });
  if (authorization.response) return { response: authorization.response };
  const resolved = await resolveProjectScope(input.projectId);
  if (!resolved) {
    return { response: studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.") };
  }
  const actorId = authorization.actorId ?? session.actorId ?? "unknown";
  return {
    kind: "key",
    key: {
      principal: {
        keyId: "session",
        tenantId: resolved.tenantId,
        actorId,
        scope: { projects: [input.projectId], tasks: [input.task] },
        project: resolved.scope,
      },
      resolved,
      record: { keyId: "session", name: "session", prefix: "" },
    },
    actorId,
    resolved,
    tenantId: resolved.tenantId,
  };
}

export { keyMetadata };
