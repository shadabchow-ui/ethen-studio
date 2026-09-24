import "server-only";

import type {
  GatewayPlatformContext,
  GatewayPlatformProject,
} from "./types";
import type { GatewayProviderId } from "../types";
import { listGatewayProjectsForCurrentUser } from "./api-keys";
import { createServiceClient } from "@ethen/database/service";

export interface ProviderAllowlistEntry {
  id: string;
  projectId: string;
  providerId: string;
  allowed: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeAllowlistEntry(row: Record<string, unknown>): ProviderAllowlistEntry {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    providerId: String(row.provider_id),
    allowed: Boolean(row.allowed),
    notes: typeof row.notes === "string" ? row.notes : null,
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getProviderAllowlist(projectId?: string): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  entries: ProviderAllowlistEntry[];
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.service) {
    return { context, project: null, entries: [] };
  }

  const scopedProject = projectId ? projects.find((entry) => entry.id === projectId) ?? null : null;
  if (projectId && !scopedProject) {
    return {
      context: { ...context, state: "unauthenticated", reason: "Project access denied." },
      project: null,
      entries: [],
    };
  }

  const projectIds = projectId ? [projectId] : projects.map((project) => project.id);
  if (projectIds.length === 0) {
    return { context, project: scopedProject, entries: [] };
  }

  const { data, error } = await context.service
    .from("gateway_provider_allowlists")
    .select("*")
    .in("project_id", projectIds)
    .order("provider_id", { ascending: true });

  if (error) {
    return {
      context: { ...context, state: "setup-required", reason: error.message },
      project: scopedProject,
      entries: [],
    };
  }

  return {
    context,
    project: scopedProject,
    entries: (data ?? []).map((row) => normalizeAllowlistEntry(row as Record<string, unknown>)),
  };
}

export async function setProviderAllowlistEntry(
  projectId: string,
  providerId: string,
  allowed: boolean,
  notes?: string | null,
): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  entry: ProviderAllowlistEntry | null;
  error: string | null;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.user || !context.service) {
    return { context, project: null, entry: null, error: context.reason ?? "Gateway platform not available." };
  }

  const project = projects.find((entry) => entry.id === projectId) ?? null;
  if (!project) {
    return { context, project: null, entry: null, error: "Project access denied." };
  }

  const providerIdTrimmed = providerId.trim();
  if (!providerIdTrimmed) {
    return { context, project, entry: null, error: "Provider ID is required." };
  }

  const existing = await context.service
    .from("gateway_provider_allowlists")
    .select("id")
    .eq("project_id", projectId)
    .eq("provider_id", providerIdTrimmed)
    .single();

  if (existing.data) {
    const { data, error } = await context.service
      .from("gateway_provider_allowlists")
      .update({ allowed, notes: notes ?? null })
      .eq("project_id", projectId)
      .eq("provider_id", providerIdTrimmed)
      .select("*")
      .single();

    if (error) {
      return { context, project, entry: null, error: error.message };
    }

    return {
      context,
      project,
      entry: normalizeAllowlistEntry(data as Record<string, unknown>),
      error: null,
    };
  }

  const { data, error } = await context.service
    .from("gateway_provider_allowlists")
    .insert({
      project_id: projectId,
      provider_id: providerIdTrimmed,
      allowed,
      notes: notes ?? null,
      created_by: context.user.id,
    })
    .select("*")
    .single();

  if (error) {
    return { context, project, entry: null, error: error.message };
  }

  return {
    context,
    project,
    entry: normalizeAllowlistEntry(data as Record<string, unknown>),
    error: null,
  };
}

export async function isProviderAllowed(
  providerId: string,
  projectId?: string | null,
): Promise<boolean> {
  if (!projectId) return true;

  const service = createServiceClient();
  if (!service) {
    // FAIL-CLOSED: When Supabase storage is unavailable, we cannot
    // verify allowlist state. Deny provider access rather than
    // silently allowing potentially unauthorized providers.
    // Private-alpha bypass: set GATEWAY_BYPASS_ALLOWLIST_CHECK=true
    const bypass = process.env.GATEWAY_BYPASS_ALLOWLIST_CHECK === "true";
    if (bypass) return true;
    return false;
  }

  try {
    const { data, error } = await service
      .from("gateway_provider_allowlists")
      .select("allowed")
      .eq("project_id", projectId)
      .eq("provider_id", providerId)
      .single();

    // If no allowlist entry exists for this project/provider pair,
    // the provider is NOT explicitly allowed — default-deny for
    // projects that have any allowlist configuration.
    if (error || !data) {
      // Check if this project has ANY allowlist entries; if so, fail-closed.
      const { count } = await service
        .from("gateway_provider_allowlists")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId);
      if (count && count > 0) {
        return false; // Project has allowlist config but this provider is not on it
      }
      return true; // No allowlist configured at all for this project — allow all
    }

    return Boolean((data as Record<string, unknown>).allowed);
  } catch {
    // FAIL-CLOSED on unexpected errors when storage is available
    return false;
  }
}

export async function filterAllowedProviders(
  providerIds: string[],
  projectId?: string | null,
): Promise<string[]> {
  if (!projectId) return providerIds;

  const results = await Promise.all(
    providerIds.map(async (id) => {
      const allowed = await isProviderAllowed(id, projectId);
      return { id, allowed };
    }),
  );

  return results.filter((r) => r.allowed).map((r) => r.id);
}
