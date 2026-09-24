import "server-only";

import type {
  GatewayPlatformContext,
  GatewayPlatformProject,
} from "./types";
import { listGatewayProjectsForCurrentUser } from "./api-keys";
import { createServiceClient } from "@ethen/database/service";
import {
  computeKeyPrefix,
  computeKeySuffix,
} from "./encryption";
import {
  getManagedCredentialVault,
  isManagedCredentialVaultConfigured,
} from "@ethen/security/credential-vault";

export const PROVIDER_CREDENTIAL_ACCESS_DENIED = "provider_credential_access_denied";
const PROVIDER_CREDENTIAL_WRITE_ROLES = new Set(["owner", "admin"]);

export interface ProviderCredentialSafe {
  id: string;
  projectId: string;
  providerId: string;
  label: string | null;
  keyPrefix: string;
  keySuffix: string;
  status: "active" | "revoked" | "test_failed";
  createdBy: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCredentialCreateInput {
  projectId: string;
  providerId: string;
  plaintextKey: string;
  label?: string | null;
}

export interface ProviderCredentialRotateInput {
  projectId: string;
  credentialId: string;
  plaintextKey: string;
  label?: string | null;
}

function isCredentialWriteAuthorized(project: GatewayPlatformProject): boolean {
  return PROVIDER_CREDENTIAL_WRITE_ROLES.has(project.membershipRole);
}

function validateReplacement(input: { plaintextKey: string; providerId: string; label?: string | null }):
  | { plaintextKey: string; providerId: string; label: string | null; keyPrefix: string; keySuffix: string }
  | { error: string } {
  if (!input.plaintextKey || typeof input.plaintextKey !== "string" || input.plaintextKey.trim().length < 8) {
    return { error: "Provider key is invalid or too short." };
  }
  if (typeof input.providerId !== "string") return { error: "Provider ID is required." };
  const providerId = input.providerId.trim();
  if (!providerId) return { error: "Provider ID is required." };
  const plaintextKey = input.plaintextKey.trim();
  return { plaintextKey, providerId, label: typeof input.label === "string" ? input.label.trim() || null : null, keyPrefix: computeKeyPrefix(plaintextKey), keySuffix: computeKeySuffix(plaintextKey) };
}

function normalizeCredential(row: Record<string, unknown>): ProviderCredentialSafe {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    providerId: String(row.provider_id),
    label: typeof row.label === "string" ? row.label : null,
    keyPrefix: String(row.key_prefix),
    keySuffix: String(row.key_suffix),
    status: (row.status as ProviderCredentialSafe["status"]) ?? "active",
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    lastTestedAt: typeof row.last_tested_at === "string" ? row.last_tested_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listProviderCredentials(projectId?: string): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  credentials: ProviderCredentialSafe[];
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.service) {
    return { context, project: null, credentials: [] };
  }

  const scopedProject = projectId ? projects.find((entry) => entry.id === projectId) ?? null : null;
  if (projectId && !scopedProject) {
    return {
      context: { ...context, state: "unauthenticated", reason: "Project access denied." },
      project: null,
      credentials: [],
    };
  }

  const projectIds = projectId ? [projectId] : projects.map((project) => project.id);
  if (projectIds.length === 0) {
    return { context, project: scopedProject, credentials: [] };
  }

  const { data, error } = await context.service
    .from("gateway_provider_credentials")
    .select("id, project_id, provider_id, label, key_prefix, key_suffix, status, created_by, last_tested_at, created_at, updated_at, vault_reference_id")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      context: { ...context, state: "setup-required", reason: error.message },
      project: scopedProject,
      credentials: [],
    };
  }

  return {
    context,
    project: scopedProject,
    credentials: (data ?? []).map((row) => normalizeCredential(row as Record<string, unknown>)),
  };
}

export async function createProviderCredential(
  input: ProviderCredentialCreateInput,
): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  credential: ProviderCredentialSafe | null;
  error: string | null;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.user || !context.service) {
    return { context, project: null, credential: null, error: context.reason ?? "Gateway platform not available." };
  }

  const project = projects.find((entry) => entry.id === input.projectId) ?? null;
  if (!project) {
    return { context, project: null, credential: null, error: "Project access denied." };
  }

  if (!isCredentialWriteAuthorized(project)) {
    return { context, project, credential: null, error: PROVIDER_CREDENTIAL_ACCESS_DENIED };
  }

  const replacement = validateReplacement(input);
  if ("error" in replacement) return { context, project, credential: null, error: replacement.error };

  if (!isManagedCredentialVaultConfigured()) {
    return {
      context,
      project,
      credential: null,
      error: "Credential vault is not configured. New BYOK credentials are disabled until a managed vault backend is available.",
    };
  }

  const vault = getManagedCredentialVault();
  if (!vault) return { context, project, credential: null, error: "Credential vault adapter is not installed." };

  let reference;
  try {
    reference = await vault.create({
      actor: { id: context.user.id, projectId: project.id },
      kind: "provider",
      secret: replacement.plaintextKey,
      purpose: `gateway.byok.create:${replacement.providerId}`,
    });
  } catch {
    return { context, project, credential: null, error: "The managed credential vault rejected the credential." };
  }

  const { data, error } = await context.service
    .from("gateway_provider_credentials")
    .insert({
      project_id: project.id,
      provider_id: replacement.providerId,
      label: replacement.label,
      key_prefix: replacement.keyPrefix,
      key_suffix: replacement.keySuffix,
      vault_reference_id: reference.id,
      created_by: context.user.id,
      status: "active",
    })
    .select("id, project_id, provider_id, label, key_prefix, key_suffix, status, created_by, last_tested_at, created_at, updated_at, vault_reference_id")
    .single();

  if (error) {
    await vault.revoke({
      actor: { id: context.user.id, projectId: project.id },
      reference,
      purpose: "gateway.byok.rollback_failed_metadata_write",
    }).catch(() => false);
    return { context, project, credential: null, error: error.message };
  }
  return { context, project, credential: normalizeCredential(data as Record<string, unknown>), error: null };
}

export async function revokeProviderCredential(
  projectId: string,
  credentialId: string,
): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  credential: ProviderCredentialSafe | null;
  error: string | null;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.service) {
    return { context, project: null, credential: null, error: context.reason ?? "Gateway platform not available." };
  }

  const project = projects.find((entry) => entry.id === projectId) ?? null;
  if (!project) {
    return { context, project: null, credential: null, error: "Project access denied." };
  }
  if (!isCredentialWriteAuthorized(project)) {
    return { context, project, credential: null, error: PROVIDER_CREDENTIAL_ACCESS_DENIED };
  }

  const { data, error } = await context.service
    .from("gateway_provider_credentials")
    .update({ status: "revoked" })
    .eq("id", credentialId)
    .eq("project_id", projectId)
    .eq("status", "active")
    .select("id, project_id, provider_id, label, key_prefix, key_suffix, status, created_by, last_tested_at, created_at, updated_at, vault_reference_id")
    .single();

  if (error) {
    return { context, project, credential: null, error: error.message };
  }

  await revokeVaultReference(
    typeof (data as Record<string, unknown>).vault_reference_id === "string"
      ? String((data as Record<string, unknown>).vault_reference_id)
      : null,
    projectId,
    context.user?.id ?? project.ownerUserId,
    "gateway.byok.revoke",
  );

  return {
    context,
    project,
    credential: normalizeCredential(data as Record<string, unknown>),
    error: null,
  };
}

export async function deleteProviderCredential(
  projectId: string,
  credentialId: string,
): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  error: string | null;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.service) {
    return { context, project: null, error: context.reason ?? "Gateway platform not available." };
  }

  const project = projects.find((entry) => entry.id === projectId) ?? null;
  if (!project) {
    return { context, project: null, error: "Project access denied." };
  }
  if (!isCredentialWriteAuthorized(project)) {
    return { context, project, error: PROVIDER_CREDENTIAL_ACCESS_DENIED };
  }

  const { data: existing } = await context.service
    .from("gateway_provider_credentials")
    .select("vault_reference_id")
    .eq("id", credentialId)
    .eq("project_id", projectId)
    .single();

  const { error } = await context.service
    .from("gateway_provider_credentials")
    .delete()
    .eq("id", credentialId)
    .eq("project_id", projectId);

  if (error) {
    return { context, project, error: error.message };
  }

  await revokeVaultReference(
    existing && typeof (existing as Record<string, unknown>).vault_reference_id === "string"
      ? String((existing as Record<string, unknown>).vault_reference_id)
      : null,
    projectId,
    context.user?.id ?? project.ownerUserId,
    "gateway.byok.delete",
  );

  return { context, project, error: null };
}

export async function rotateProviderCredential(
  input: ProviderCredentialRotateInput,
): Promise<{
  context: GatewayPlatformContext;
  project: GatewayPlatformProject | null;
  credential: ProviderCredentialSafe | null;
  error: string | null;
  cleanupRequired: boolean;
}> {
  const { context, projects } = await listGatewayProjectsForCurrentUser();
  if (context.state !== "ready" || !context.user || !context.service) {
    return { context, project: null, credential: null, error: context.reason ?? "Gateway platform not available.", cleanupRequired: false };
  }
  const project = projects.find((entry) => entry.id === input.projectId) ?? null;
  if (!project || !isCredentialWriteAuthorized(project)) {
    return { context, project, credential: null, error: PROVIDER_CREDENTIAL_ACCESS_DENIED, cleanupRequired: false };
  }

  const { data: existing, error: existingError } = await context.service
    .from("gateway_provider_credentials")
    .select("id, project_id, provider_id, label, key_prefix, key_suffix, status, created_by, last_tested_at, created_at, updated_at, vault_reference_id")
    .eq("id", input.credentialId)
    .eq("project_id", project.id)
    .eq("status", "active")
    .single();
  if (existingError || !existing) {
    return { context, project, credential: null, error: "Credential access denied or no longer active.", cleanupRequired: false };
  }
  const old = normalizeCredential(existing as Record<string, unknown>);
  const replacement = validateReplacement({ plaintextKey: input.plaintextKey, providerId: old.providerId, label: input.label ?? old.label });
  if ("error" in replacement) return { context, project, credential: null, error: replacement.error, cleanupRequired: false };
  if (!isManagedCredentialVaultConfigured()) {
    return { context, project, credential: null, error: "Credential vault is not configured. New BYOK credentials are disabled until a managed vault backend is available.", cleanupRequired: false };
  }
  const vault = getManagedCredentialVault();
  if (!vault) return { context, project, credential: null, error: "Credential vault adapter is not installed.", cleanupRequired: false };

  let staged;
  try {
    staged = await vault.createStaged({ actor: { id: context.user.id, projectId: project.id }, kind: "provider", secret: replacement.plaintextKey, purpose: `gateway.byok.rotate.stage:${replacement.providerId}` });
  } catch {
    return { context, project, credential: null, error: "The managed credential vault rejected the replacement credential.", cleanupRequired: false };
  }
  try {
    if (!await vault.activate({ actor: { id: context.user.id, projectId: project.id }, reference: staged, purpose: `gateway.byok.rotate.activate:${replacement.providerId}` })) {
      throw new Error("replacement activation failed");
    }
  } catch {
    await vault.revoke({ actor: { id: context.user.id, projectId: project.id }, reference: staged, purpose: "gateway.byok.rotate.rollback_activation" }).catch(() => false);
    return { context, project, credential: null, error: "Replacement credential could not be activated.", cleanupRequired: false };
  }

  const { data, error } = await context.service
    .from("gateway_provider_credentials")
    .update({ vault_reference_id: staged.id, label: replacement.label, key_prefix: replacement.keyPrefix, key_suffix: replacement.keySuffix, status: "active" })
    .eq("id", old.id)
    .eq("project_id", project.id)
    .eq("status", "active")
    .select("id, project_id, provider_id, label, key_prefix, key_suffix, status, created_by, last_tested_at, created_at, updated_at, vault_reference_id")
    .single();
  if (error || !data || (data as Record<string, unknown>).vault_reference_id !== staged.id) {
    await vault.revoke({ actor: { id: context.user.id, projectId: project.id }, reference: staged, purpose: "gateway.byok.rotate.rollback_metadata_write" }).catch(() => false);
    return { context, project, credential: null, error: error?.message ?? "Replacement credential activation could not be verified.", cleanupRequired: false };
  }

  const active = await vault.metadata(staged.id);
  if (!active || active.status !== "active") {
    // The database has selected the replacement; do not revoke the old secret here.
    return { context, project, credential: normalizeCredential(data as Record<string, unknown>), error: "Replacement credential activation could not be verified.", cleanupRequired: true };
  }
  try {
    await revokeVaultReference(
      typeof (existing as Record<string, unknown>).vault_reference_id === "string"
        ? String((existing as Record<string, unknown>).vault_reference_id)
        : null,
      project.id,
      context.user.id,
      "gateway.byok.rotate.supersede_old",
    );
  } catch {
    return { context, project, credential: normalizeCredential(data as Record<string, unknown>), error: null, cleanupRequired: true };
  }
  return { context, project, credential: normalizeCredential(data as Record<string, unknown>), error: null, cleanupRequired: false };
}

export async function getDecryptedProviderKey(
  credentialId: string,
  projectId: string,
): Promise<string | null> {
  const service = createServiceClient();
  if (!service) return null;

  const { data, error } = await service
    .from("gateway_provider_credentials")
    .select("vault_reference_id, status")
    .eq("id", credentialId)
    .eq("project_id", projectId)
    .eq("status", "active")
    .single();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const referenceId = String(row.vault_reference_id ?? "");
  return resolveVaultProviderKey(referenceId, projectId, "gateway.byok.resolve_by_id");
}

export async function getDecryptedProviderKeyForProvider(
  providerId: string,
  projectId: string,
): Promise<string | null> {
  const service = createServiceClient();
  if (!service) return null;

  const { data, error } = await service
    .from("gateway_provider_credentials")
    .select("id, vault_reference_id, status")
    .eq("project_id", projectId)
    .eq("provider_id", providerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const referenceId = String(row.vault_reference_id ?? "");
  return resolveVaultProviderKey(referenceId, projectId, `gateway.byok.resolve_provider:${providerId}`);
}

async function resolveVaultProviderKey(referenceId: string, projectId: string, purpose: string): Promise<string | null> {
  const vault = getManagedCredentialVault();
  if (!vault || !referenceId) return null;
  return vault.resolveActiveReference({
    actor: { id: "gateway-runtime", projectId },
    referenceId,
    kind: "provider",
    purpose,
  });
}

async function revokeVaultReference(
  referenceId: string | null,
  projectId: string,
  actorId: string,
  purpose: string,
): Promise<void> {
  const vault = getManagedCredentialVault();
  if (!vault || !referenceId) return;
  const metadata = await vault.metadata(referenceId);
  if (!metadata) return;
  await vault.revoke({
    actor: { id: actorId, projectId },
    reference: metadata.reference,
    purpose,
  });
}

export async function updateCredentialTestResult(
  credentialId: string,
  projectId: string,
  success: boolean,
): Promise<void> {
  const service = createServiceClient();
  if (!service) return;

  try {
    await service
      .from("gateway_provider_credentials")
      .update({
        last_tested_at: new Date().toISOString(),
        status: success ? "active" : "test_failed",
        ...(success ? {} : {}),
      })
      .eq("id", credentialId)
      .eq("project_id", projectId);
  } catch {
    // best-effort
  }
}
