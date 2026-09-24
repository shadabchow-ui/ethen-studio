/**
 * PR-AG-01: Canonical tenant-owned agent session creation.
 *
 * Replaces the mock/draft/demo session ID generation in the launch route
 * with real tenant-owned sessions. Sessions are durable and project-scoped.
 *
 * When Supabase is unavailable (dev/mock mode), falls back to prefix-free
 * local session IDs that are NOT labeled as "demo-", "mock-", or "draft-".
 *
 * Security:
 * - Ownership is NEVER inferred from an identifier prefix.
 * - Database errors during ownership lookup FAIL CLOSED (deny access).
 * - Production persistence failure throws/surfaces an error instead of falling back to a local ID.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import type { ToolId } from "@ethen/contracts/tools/types";
import { recordAuditEvent } from "@ethen/security/audit/service";
import { isMockMode, hasSupabaseEnv } from "@ethen/config/runtime-flags";
import { isMockModeAllowed } from "@ethen/config/env-contract";

const AGENT_LAUNCH_TOOL_ID: ToolId = "system/agent-launch";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// In-memory tenant registry for dev/mock mode local sessions only.
// Ensures local sessions are explicitly tied to their creator tenant,
// preventing synthetic identifier bypass even in local development.
const localSessionTenantRegistry = new Map<string, string>();

export function registerLocalSession(sessionId: string, tenantId: string): void {
  localSessionTenantRegistry.set(sessionId, tenantId);
}

export function resetLocalSessionRegistry(): void {
  localSessionTenantRegistry.clear();
}

// ─── Session Types ──────────────────────────────────────────────────────────

export interface AgentSession {
  id: string;
  agentSlug: string;
  projectId: string | null;
  tenantId: string;
  createdAt: string;
  isPersisted: boolean;
}

export interface CreateSessionInput {
  agentSlug: string;
  projectId?: string;
  tenantId: string;
}

export class SessionPersistenceError extends Error {
  readonly code = "SESSION_PERSISTENCE_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "SessionPersistenceError";
  }
}

// ─── Session Creation ────────────────────────────────────────────────────────

/**
 * Create a canonical tenant-owned agent session.
 *
 * In production (Supabase available): creates a DB-backed session record via bridged client.
 * If database persistence fails in production, surfaces an error — NEVER falls back to local ID.
 *
 * In dev/mock mode: creates a local session ID and registers it to the tenant.
 * Never returns a session ID with "mock-", "demo-", or "draft-" prefix.
 */
export async function createAgentSession(
  input: CreateSessionInput,
): Promise<AgentSession> {
  const now = new Date().toISOString();
  const isProduction = !isMockModeAllowed() || process.env.NODE_ENV === "production";
  const shouldPersist = hasSupabaseEnv() && (!isMockMode || isProduction);

  // Production path: persist session in Supabase
  if (shouldPersist) {
    try {
      let projectId = input.projectId;

      // When projectId is not supplied, attempt to resolve canonical default project
      if (!projectId && UUID_REGEX.test(input.tenantId)) {
        try {
          const { resolveDefaultProjectIdForActor } = await import("../platform/auth/project-auth");
          projectId = (await resolveDefaultProjectIdForActor(input.tenantId)) ?? undefined;
        } catch {
          // If project resolution fails, projectId remains undefined
        }
      }

      if (!projectId) {
        throw new SessionPersistenceError("Cannot persist a durable session without a valid project id.");
      }

      const { createClient, createBridgedClient } = await import("@ethen/database/server");
      const supabase = UUID_REGEX.test(input.tenantId)
        ? createBridgedClient(input.tenantId)
        : await createClient();

      // agent_sessions.id is `text primary key` with no database default, so
      // the row must carry an id or the insert violates NOT NULL. Keep the
      // `session-<agentSlug>~<random>` shape the local path and
      // app/workspace/[sessionId] both parse; the prefix is routing sugar only
      // and never implies ownership (see the security notes above).
      const durableId = `session-${input.agentSlug}~${randomUUID().replace(/-/g, "").slice(0, 12)}`;

      const { data, error } = await supabase
        .from("agent_sessions")
        .insert({
          id: durableId,
          agent_slug: input.agentSlug,
          project_id: projectId,
          tenant_id: input.tenantId,
          // 'created' is not in agent_sessions_status_check; 'queued' is the
          // schema's initial state (and its column default).
          status: "queued",
          created_at: now,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new SessionPersistenceError(
          `Failed to persist agent session: ${error?.message ?? "unknown database error"}`,
        );
      }

      recordAuditEvent(
        "agent.session_created",
        AGENT_LAUNCH_TOOL_ID,
        data.id,
        {
          agentSlug: input.agentSlug,
          sessionId: data.id,
          tenantId: input.tenantId,
          projectId,
          actorId: input.tenantId,
          target: { kind: "agent_session", id: data.id },
          result: "persisted",
          persisted: true,
          summary: `Persisted agent session for "${input.agentSlug}"`,
        },
      );

      return {
        id: data.id,
        agentSlug: input.agentSlug,
        projectId,
        tenantId: input.tenantId,
        createdAt: now,
        isPersisted: true,
      };
    } catch (err) {
      // In production: NEVER fall back to local unpersisted sessions. Fail closed.
      if (isProduction) {
        throw err instanceof Error ? err : new SessionPersistenceError(String(err));
      }
      // In dev/test: only fall through if mock mode is explicitly allowed
      if (!isMockModeAllowed()) {
        throw err instanceof Error ? err : new SessionPersistenceError(String(err));
      }
    }
  }

  // Dev/mock path: local session ID with NO "demo-", "mock-", or "draft-" prefix.
  // Uses a clean "session-" prefix with random hex.
  const localId = `session-${input.agentSlug}~${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  registerLocalSession(localId, input.tenantId);

  recordAuditEvent(
    "agent.session_created",
    AGENT_LAUNCH_TOOL_ID,
    localId,
    {
      agentSlug: input.agentSlug,
      sessionId: localId,
      tenantId: input.tenantId,
      projectId: input.projectId ?? null,
      actorId: input.tenantId,
      target: { kind: "agent_session", id: localId },
      result: "local_unpersisted",
      persisted: false,
      summary: `Local agent session for "${input.agentSlug}" (Supabase unavailable)`,
    },
  );

  return {
    id: localId,
    agentSlug: input.agentSlug,
    projectId: input.projectId ?? null,
    tenantId: input.tenantId,
    createdAt: now,
    isPersisted: false,
  };
}

/**
 * Verify a session belongs to a tenant.
 *
 * Security Invariants:
 * 1. Ownership is NEVER inferred from an identifier prefix (e.g. "session-*").
 * 2. Database errors/outages FAIL CLOSED (return false, denying access).
 * 3. Cross-tenant access is strictly denied (returns false).
 */
export async function verifySessionOwnership(
  sessionId: string,
  tenantId: string,
): Promise<boolean> {
  if (!sessionId || !tenantId) return false;

  // Local sessions (dev/mock mode): verify against registered tenant.
  // Never grant ownership based solely on the "session-" prefix.
  if (localSessionTenantRegistry.has(sessionId)) {
    return localSessionTenantRegistry.get(sessionId) === tenantId;
  }

  // DB-backed sessions: query Supabase under tenant context
  if (hasSupabaseEnv()) {
    try {
      const { createClient, createBridgedClient } = await import("@ethen/database/server");
      const supabase = UUID_REGEX.test(tenantId)
        ? createBridgedClient(tenantId)
        : await createClient();

      const { data, error } = await supabase
        .from("agent_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (error) {
        console.error("[agents/session] Database error during ownership verification:", error.message);
        return false; // Database error denies rather than allows (fail-closed)
      }

      return data !== null;
    } catch (err) {
      console.error("[agents/session] Database exception during ownership verification:", err);
      return false; // Database outage/exception denies rather than allows (fail-closed)
    }
  }

  return false;
}

/**
 * Check whether a session ID uses the old "demo-", "mock-", or "draft-" prefix.
 * Returns true if the session ID is a legacy prefix format.
 */
export function isLegacySessionId(sessionId: string): boolean {
  return (
    sessionId.startsWith("demo-") ||
    sessionId.startsWith("mock-") ||
    sessionId.startsWith("draft-")
  );
}
