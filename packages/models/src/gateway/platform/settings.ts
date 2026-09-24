import "server-only";

import type {
  GatewayPlatformContext,
  GatewayPlatformProject,
} from "./types";
import type { GatewayProviderId } from "../types";
import { listGatewayProjectsForCurrentUser } from "./api-keys";
import { createServiceClient } from "@ethen/database/service";

export interface GatewaySettingsRecord {
  id: string;
  projectId: string;
  settings: GatewaySettingsPayload;
  createdAt: string;
  updatedAt: string;
}

export interface GatewaySettingsPayload {
  zeroDataRetention?: boolean;
  loggingMode?: "metadata_only" | "content" | "off";
  contentRetentionDays?: number | null;
  platformFallbackEnabled?: boolean;
  platformFallbackProviderId?: string | null;
  defaultProviderOrder?: string[];
  providerSettings?: Record<string, { enabled?: boolean; apiBaseUrl?: string }>;
  rateLimitRpm?: number | null;
  rateLimitTpm?: number | null;
}

export const DEFAULT_GATEWAY_SETTINGS: GatewaySettingsPayload = {
  zeroDataRetention: false,
  loggingMode: "metadata_only",
  contentRetentionDays: 30,
  platformFallbackEnabled: true,
  platformFallbackProviderId: null,
  defaultProviderOrder: [],
  providerSettings: {},
  rateLimitRpm: null,
  rateLimitTpm: null,
};

function normalizeSettings(row: Record<string, unknown>): GatewaySettingsRecord {
  const rawSettings = (row.settings as Record<string, unknown>) ?? {};
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    settings: {
      zeroDataRetention: typeof rawSettings.zeroDataRetention === "boolean" ? rawSettings.zeroDataRetention : DEFAULT_GATEWAY_SETTINGS.zeroDataRetention,
      loggingMode: isValidLoggingMode(rawSettings.loggingMode) ? rawSettings.loggingMode as GatewaySettingsPayload["loggingMode"] : DEFAULT_GATEWAY_SETTINGS.loggingMode,
      contentRetentionDays: typeof rawSettings.contentRetentionDays === "number" ? rawSettings.contentRetentionDays : DEFAULT_GATEWAY_SETTINGS.contentRetentionDays,
      platformFallbackEnabled: typeof rawSettings.platformFallbackEnabled === "boolean" ? rawSettings.platformFallbackEnabled : DEFAULT_GATEWAY_SETTINGS.platformFallbackEnabled,
      platformFallbackProviderId: typeof rawSettings.platformFallbackProviderId === "string" ? rawSettings.platformFallbackProviderId : DEFAULT_GATEWAY_SETTINGS.platformFallbackProviderId,
      defaultProviderOrder: Array.isArray(rawSettings.defaultProviderOrder) ? rawSettings.defaultProviderOrder.map(String) : DEFAULT_GATEWAY_SETTINGS.defaultProviderOrder,
      providerSettings: typeof rawSettings.providerSettings === "object" && rawSettings.providerSettings !== null ? rawSettings.providerSettings as Record<string, { enabled?: boolean; apiBaseUrl?: string }> : DEFAULT_GATEWAY_SETTINGS.providerSettings,
      rateLimitRpm: typeof rawSettings.rateLimitRpm === "number" ? rawSettings.rateLimitRpm : DEFAULT_GATEWAY_SETTINGS.rateLimitRpm,
      rateLimitTpm: typeof rawSettings.rateLimitTpm === "number" ? rawSettings.rateLimitTpm : DEFAULT_GATEWAY_SETTINGS.rateLimitTpm,
    },
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function isValidLoggingMode(value: unknown): value is GatewaySettingsPayload["loggingMode"] {
  return value === "metadata_only" || value === "content" || value === "off";
}

export async function getGatewaySettings(projectId?: string): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  settings: GatewaySettingsPayload;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.service) {
    return { context, project: null, settings: { ...DEFAULT_GATEWAY_SETTINGS } };
  }

  const resolvedProjectId = projectId ?? projects[0]?.id;
  if (!resolvedProjectId) {
    return { context, project: null, settings: { ...DEFAULT_GATEWAY_SETTINGS } };
  }

  const scopedProject = projects.find((entry) => entry.id === resolvedProjectId) ?? null;
  if (!scopedProject) {
    return { context, project: null, settings: { ...DEFAULT_GATEWAY_SETTINGS } };
  }

  const { data, error } = await context.service
    .from("gateway_settings")
    .select("*")
    .eq("project_id", resolvedProjectId)
    .single();

  if (error || !data) {
    return { context, project: scopedProject, settings: { ...DEFAULT_GATEWAY_SETTINGS } };
  }

  const record = normalizeSettings(data as Record<string, unknown>);
  return { context, project: scopedProject, settings: record.settings };
}

export async function upsertGatewaySettings(
  projectId: string,
  partial: Partial<GatewaySettingsPayload>,
): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  settings: GatewaySettingsPayload | null;
  error: string | null;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.service) {
    return { context, project: null, settings: null, error: context.reason ?? "Gateway platform not available." };
  }

  const project = projects.find((entry) => entry.id === projectId) ?? null;
  if (!project) {
    return { context, project: null, settings: null, error: "Project access denied." };
  }

  const existing = await context.service
    .from("gateway_settings")
    .select("id, settings")
    .eq("project_id", projectId)
    .single();

  const current: Record<string, unknown> = existing.data
    ? (existing.data as Record<string, unknown>).settings as Record<string, unknown> ?? {}
    : {};

  const merged: Record<string, unknown> = { ...current, ...partial };

  if (existing.data) {
    const { data, error } = await context.service
      .from("gateway_settings")
      .update({ settings: merged })
      .eq("project_id", projectId)
      .select("*")
      .single();

    if (error) {
      return { context, project, settings: null, error: error.message };
    }

    const record = normalizeSettings(data as Record<string, unknown>);
    return { context, project, settings: record.settings, error: null };
  }

  const { data, error } = await context.service
    .from("gateway_settings")
    .insert({ project_id: projectId, settings: merged })
    .select("*")
    .single();

  if (error) {
    return { context, project, settings: null, error: error.message };
  }

  const record = normalizeSettings(data as Record<string, unknown>);
  return { context, project, settings: record.settings, error: null };
}

export async function resolveEffectiveProviderOrder(
  projectId?: string | null,
  explicitOrder?: GatewayProviderId[] | null,
): Promise<GatewayProviderId[]> {
  const DEFAULT_ORDER: GatewayProviderId[] = ["deepseek", "openai", "anthropic", "openai-compatible"];

  if (explicitOrder && explicitOrder.length > 0) {
    return explicitOrder;
  }

  if (!projectId) return DEFAULT_ORDER;

  try {
    const { settings } = await getGatewaySettings(projectId);
    if (settings.defaultProviderOrder && settings.defaultProviderOrder.length > 0) {
      return settings.defaultProviderOrder as GatewayProviderId[];
    }
  } catch {
    // fall through
  }

  return DEFAULT_ORDER;
}
