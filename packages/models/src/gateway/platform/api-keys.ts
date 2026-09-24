import "server-only";

import type {
  GatewayApiKeyCreationResult,
  GatewayApiKeyMetadata,
  GatewayKeyCreateInput,
  GatewayPlatformContext,
  GatewayPlatformProject,
  GatewayProjectAccess,
} from "./types";
import {
  buildGatewayApiKey,
  hashGatewayApiKey,
  verifyGatewayApiKeyHash,
} from "./crypto";
import { createClient } from "@ethen/database/server";
import { createServiceClient } from "@ethen/database/service";
import { hasConfiguredSupabasePublicEnv } from "@ethen/config/env";

export const GATEWAY_API_KEY_SCOPES = ["gateway:read", "gateway:invoke"] as const;
export type GatewayApiKeyScope = (typeof GATEWAY_API_KEY_SCOPES)[number];
const DEFAULT_KEY_SCOPES: GatewayApiKeyScope[] = [...GATEWAY_API_KEY_SCOPES];
const WRITE_ROLES = new Set(["owner", "admin"]);

export function normalizeGatewayKeyScopes(scopes?: string[]): GatewayApiKeyScope[] {
  const values = scopes ?? DEFAULT_KEY_SCOPES;
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (normalized.length === 0) throw new Error("At least one Gateway key scope is required.");
  const invalid = normalized.filter(
    (value): value is string => !GATEWAY_API_KEY_SCOPES.includes(value as GatewayApiKeyScope),
  );
  if (invalid.length > 0) throw new Error(`Unsupported Gateway key scope: ${invalid.join(", ")}.`);
  return normalized as GatewayApiKeyScope[];
}

export function authorizeGatewayApiKey(
  key: { project_id: string; scopes: string[]; revoked_at: string | null; expires_at: string | null },
  input: { requiredScope: GatewayApiKeyScope; projectId?: string; now?: Date },
): { allowed: true } | { allowed: false; code: "wrong_project" | "revoked_api_key" | "expired_api_key" | "insufficient_scope" } {
  if (input.projectId && key.project_id !== input.projectId) return { allowed: false, code: "wrong_project" };
  if (key.revoked_at) return { allowed: false, code: "revoked_api_key" };
  if (key.expires_at && new Date(key.expires_at).getTime() <= (input.now ?? new Date()).getTime()) {
    return { allowed: false, code: "expired_api_key" };
  }
  if (!key.scopes.includes(input.requiredScope)) return { allowed: false, code: "insufficient_scope" };
  return { allowed: true };
}

function normalizeProject(row: Record<string, unknown>, membershipRole?: string | null): GatewayPlatformProject {
  return {
    id: String(row.id),
    name: String(row.name ?? "Untitled project"),
    slug: typeof row.slug === "string" ? row.slug : null,
    description: typeof row.description === "string" ? row.description : null,
    status: (row.status as GatewayPlatformProject["status"]) ?? "private_alpha",
    ownerUserId: String(row.owner_user_id),
    membershipRole: (membershipRole as GatewayPlatformProject["membershipRole"]) ?? "owner",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function computeKeyStatus(input: { revoked_at?: string | null; expires_at?: string | null }): GatewayApiKeyMetadata["status"] {
  if (input.revoked_at) return "revoked";
  if (input.expires_at && new Date(input.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
}

function normalizeKey(row: Record<string, unknown>): GatewayApiKeyMetadata {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    environment: (row.environment as "live" | "test") ?? "live",
    keyPrefix: String(row.key_prefix),
    keySuffix: String(row.key_suffix),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastUsedAt: typeof row.last_used_at === "string" ? row.last_used_at : null,
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
    status: computeKeyStatus({
      revoked_at: typeof row.revoked_at === "string" ? row.revoked_at : null,
      expires_at: typeof row.expires_at === "string" ? row.expires_at : null,
    }),
  };
}

export async function getGatewayPlatformContext(): Promise<GatewayPlatformContext> {
  if (!hasConfiguredSupabasePublicEnv()) {
    return {
      state: "setup-required",
      user: null,
      service: null,
      reason: "Supabase environment variables are not configured for the Gateway scaffold.",
    };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return {
      state: "setup-required",
      user: null,
      service: null,
      reason: "Supabase server client is unavailable in this environment.",
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      state: "unauthenticated",
      user: null,
      service: null,
      reason: "Sign in to access Gateway project scaffolding.",
    };
  }

  const service = createServiceClient();
  if (!service) {
    return {
      state: "setup-required",
      user,
      service: null,
      reason: "SUPABASE_SERVICE_ROLE_KEY is required for Gateway management routes.",
    };
  }

  return { state: "ready", user, service, reason: null };
}

export async function listGatewayProjectsForCurrentUser(): Promise<{
  context: GatewayPlatformContext;
  projects: GatewayPlatformProject[];
}> {
  const context = await getGatewayPlatformContext();
  if (context.state !== "ready" || !context.user || !context.service) {
    return { context, projects: [] };
  }

  const ownedPromise = context.service
    .from("projects")
    .select("*")
    .eq("owner_user_id", context.user.id)
    .order("updated_at", { ascending: false });

  const memberPromise = context.service
    .from("project_members")
    .select("role, projects(*)")
    .eq("user_id", context.user.id);

  const [{ data: ownedRows, error: ownedError }, { data: memberRows, error: memberError }] = await Promise.all([
    ownedPromise,
    memberPromise,
  ]);

  if (ownedError || memberError) {
    return {
      context: {
        ...context,
        state: "setup-required",
        reason: ownedError?.message ?? memberError?.message ?? "Project scaffold tables are unavailable.",
      },
      projects: [],
    };
  }

  const byId = new Map<string, GatewayPlatformProject>();

  for (const row of ownedRows ?? []) {
    const project = normalizeProject(row as Record<string, unknown>, "owner");
    byId.set(project.id, project);
  }

  for (const row of memberRows ?? []) {
    const nested = (row as { projects?: Record<string, unknown> | Record<string, unknown>[] | null }).projects;
    const projectRow = Array.isArray(nested) ? nested[0] : nested;
    if (!projectRow || !projectRow.id) continue;
    const role = typeof (row as { role?: string }).role === "string" ? (row as { role: string }).role : "member";
    const project = normalizeProject(projectRow, role);
    if (!byId.has(project.id)) {
      byId.set(project.id, project);
    }
  }

  return {
    context,
    projects: [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  };
}

export async function getGatewayProjectAccess(projectId: string): Promise<GatewayProjectAccess> {
  const { projects } = await listGatewayProjectsForCurrentUser();
  const project = projects.find((entry) => entry.id === projectId) ?? null;
  if (!project) {
    return {
      project: null,
      allowed: false,
      reason: "This Gateway scaffold only exposes projects you own or are a member of.",
    };
  }

  return { project, allowed: true, reason: null };
}

export async function listGatewayApiKeys(projectId?: string): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  keys: GatewayApiKeyMetadata[];
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.user || !context.service) {
    return { context, project: null, keys: [] };
  }

  const scopedProject = projectId ? projects.find((entry) => entry.id === projectId) ?? null : null;
  if (projectId && !scopedProject) {
    return {
      context: { ...context, state: "unauthenticated", reason: "Project access denied for API key metadata." },
      project: null,
      keys: [],
    };
  }

  const projectIds = projectId ? [projectId] : projects.map((project) => project.id);
  if (projectIds.length === 0) {
    return { context, project: scopedProject, keys: [] };
  }

  const { data, error } = await context.service
    .from("gateway_api_keys")
    .select("*")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      context: { ...context, state: "setup-required", reason: error.message },
      project: scopedProject,
      keys: [],
    };
  }

  return {
    context,
    project: scopedProject,
    keys: (data ?? []).map((row) => normalizeKey(row as Record<string, unknown>)),
  };
}

export async function createGatewayApiKey(input: GatewayKeyCreateInput): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  result: GatewayApiKeyCreationResult | null;
  error: string | null;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.user || !context.service) {
    return { context, project: null, result: null, error: context.reason };
  }

  const project = projects.find((entry) => entry.id === input.projectId) ?? null;
  if (!project) {
    return { context, project: null, result: null, error: "Project access denied." };
  }

  if (!WRITE_ROLES.has(project.membershipRole)) {
    return { context, project, result: null, error: "Only project owners or admins can create Gateway keys." };
  }

  const name = input.name.trim();
  if (!name) {
    return { context, project, result: null, error: "Key name is required." };
  }

  const environment = input.environment ?? "live";
  let scopes: GatewayApiKeyScope[];
  try {
    scopes = normalizeGatewayKeyScopes(input.scopes);
  } catch (error) {
    return { context, project, result: null, error: error instanceof Error ? error.message : "Invalid key scopes." };
  }
  const { rawKey, keyPrefix, keySuffix } = buildGatewayApiKey(environment);
  const keyHash = hashGatewayApiKey(rawKey);

  const insertPayload = {
    project_id: project.id,
    name,
    environment,
    key_prefix: keyPrefix,
    key_suffix: keySuffix,
    key_hash: keyHash,
    scopes,
    created_by: context.user.id,
    expires_at: input.expiresAt ?? null,
  };

  const { data, error } = await context.service
    .from("gateway_api_keys")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    return { context, project, result: null, error: error.message };
  }

  return {
    context,
    project,
    result: {
      rawKey,
      metadata: normalizeKey(data as Record<string, unknown>),
    },
    error: null,
  };
}

export async function revokeGatewayApiKey(projectId: string, keyId: string): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  key: GatewayApiKeyMetadata | null;
  error: string | null;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.user || !context.service) {
    return { context, project: null, key: null, error: context.reason };
  }

  const project = projects.find((entry) => entry.id === projectId) ?? null;
  if (!project) {
    return { context, project: null, key: null, error: "Project access denied." };
  }

  if (!WRITE_ROLES.has(project.membershipRole)) {
    return { context, project, key: null, error: "Only project owners or admins can revoke Gateway keys." };
  }

  const { data, error } = await context.service
    .from("gateway_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("project_id", project.id)
    .is("revoked_at", null)
    .select("*")
    .single();

  if (error) {
    return { context, project, key: null, error: error.message };
  }

  return {
    context,
    project,
    key: normalizeKey(data as Record<string, unknown>),
    error: null,
  };
}
