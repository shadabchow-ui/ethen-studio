import "server-only";

/**
 * STUDIO_06 route-adapter catalog access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed reads over the j06 schema. Service-role bypasses RLS, so
 * every scoped call binds explicit tenant/workspace/project scope.
 */
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import type {
  EndpointSpec,
  QualificationAttestation,
} from "@ethen/studio-core/catalog";
import type { PriceRowView } from "@ethen/studio-core/catalog/price-states";
import type { TaskName } from "@ethen/studio-core/contracts";

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function strArray(row: Row, key: string): string[] {
  const value = row[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function obj(row: Row, key: string): Readonly<Record<string, unknown>> {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bool(row: Row, key: string): boolean {
  return row[key] === true;
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function iso(row: Row, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : new Date().toISOString();
}

function toSpec(row: Row): EndpointSpec {
  const raw = obj(row, "raw_params");
  const rawParams: Record<string, "string" | "number" | "boolean" | "integer"> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === "string" || v === "number" || v === "boolean" || v === "integer") rawParams[k] = v;
  }
  return {
    endpointId: str(row, "endpoint_id"),
    familyId: str(row, "family_id"),
    providerId: str(row, "provider_id"),
    task: str(row, "task_name") as TaskName,
    label: str(row, "label"),
    description: str(row, "description"),
    adapterName: str(row, "adapter_name"),
    adapterVersion: str(row, "adapter_version"),
    schemaVersion: str(row, "schema_version"),
    jsonSchema: obj(row, "schema"),
    requiredControls: strArray(row, "required_controls"),
    supportedControls: strArray(row, "supported_controls"),
    rawParams,
    priceVersion: str(row, "price_version"),
    policyProfile: str(row, "policy_profile") || "standard",
    identityBinding: bool(row, "identity_binding"),
    capabilityTags: strArray(row, "capability_tags"),
  };
}

function toAttestation(row: Row): QualificationAttestation {
  return {
    endpointId: str(row, "endpoint_id"),
    adapterName: str(row, "adapter_name"),
    adapterVersion: str(row, "adapter_version"),
    schemaVersion: str(row, "schema_version"),
    policyProfile: str(row, "policy_profile"),
    priceVersion: str(row, "price_version"),
    executable: bool(row, "executable"),
    evidenceHash: nullableStr(row, "evidence_hash"),
    attestedBy: str(row, "attested_by"),
    attestedAt: iso(row, "attested_at"),
    expiresAt: iso(row, "expires_at"),
  };
}

export async function listEndpointSpecs(task?: TaskName): Promise<EndpointSpec[]> {
  const client = requireServiceClient();
  let query = client.from("studio_v5_endpoints").select("*").order("endpoint_id");
  if (task) query = query.eq("task_name", task);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list endpoints: ${error.message}`);
  return ((data ?? []) as Row[]).map(toSpec);
}

export async function getEndpointSpec(endpointId: string): Promise<EndpointSpec | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_endpoints")
    .select("*")
    .eq("endpoint_id", endpointId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load endpoint: ${error.message}`);
  return data ? toSpec(data as Row) : null;
}

export async function listAttestations(endpointIds: readonly string[]): Promise<QualificationAttestation[]> {
  if (endpointIds.length === 0) return [];
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_endpoint_attestations")
    .select("*")
    .in("endpoint_id", [...endpointIds])
    .order("attested_at", { ascending: false });
  if (error) throw new Error(`Failed to list attestations: ${error.message}`);
  return ((data ?? []) as Row[]).map(toAttestation);
}

export async function resolveEndpointAlias(storedId: string): Promise<string | null> {
  const client = requireServiceClient();
  const { data, error } = await client.rpc("studio_v5_resolve_endpoint_alias", { p_alias: storedId });
  if (error) throw new Error(`Failed to resolve alias: ${error.message}`);
  return typeof data === "string" ? data : null;
}

export async function listAliases(): Promise<{ alias: string; endpointId: string; namespace: string }[]> {
  const client = requireServiceClient();
  const { data, error } = await client.from("studio_v5_endpoint_aliases").select("alias,endpoint_id,namespace");
  if (error) throw new Error(`Failed to list aliases: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    alias: str(row, "alias"),
    endpointId: str(row, "endpoint_id"),
    namespace: str(row, "namespace"),
  }));
}

export async function listDisabledEndpoints(): Promise<Set<string>> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_endpoints")
    .select("endpoint_id")
    .eq("enabled", false);
  if (error) throw new Error(`Failed to list disabled endpoints: ${error.message}`);
  return new Set(((data ?? []) as Row[]).map((row) => str(row, "endpoint_id")));
}

export async function listPausedEndpoints(): Promise<Set<string>> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_provider_breakers")
    .select("endpoint_id")
    .eq("paused", true);
  if (error) throw new Error(`Failed to list breakers: ${error.message}`);
  return new Set(((data ?? []) as Row[]).map((row) => str(row, "endpoint_id")));
}

export async function checkAllowance(
  scope: ResolvedScope,
  providerId: string,
  endpointId: string,
): Promise<{ allowed: boolean; reason: string }> {
  const client = requireServiceClient();
  const { data, error } = await client.rpc("studio_v5_check_allowance", {
    p_tenant_id: scope.tenantId,
    p_workspace_id: scope.workspaceId,
    p_provider_id: providerId,
    p_endpoint_id: endpointId,
  });
  if (error) throw new Error(`Failed to check allowance: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
  return { allowed: row?.allowed === true, reason: String(row?.reason ?? "") };
}

/**
 * M2 — latest live price row per endpoint. Rows without an M2
 * `price_status`/`evidence_hash` (pre-migration) fail closed to UNKNOWN.
 */
export async function listPriceRows(): Promise<Map<string, PriceRowView>> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_price_configs")
    .select("*")
    .order("effective_at", { ascending: false });
  if (error) throw new Error(`Failed to list price configs: ${error.message}`);
  const rows = new Map<string, PriceRowView>();
  for (const raw of ((data ?? []) as Row[])) {
    const endpointId = str(raw, "endpoint_id");
    if (!endpointId || rows.has(endpointId)) continue;
    if (raw["retired_at"] !== null && raw["retired_at"] !== undefined) continue;
    const status = raw["price_status"];
    rows.set(endpointId, {
      status: status === "VERIFIED" || status === "DERIVED" ? status : "UNKNOWN",
      evidenceHash: nullableStr(raw, "evidence_hash"),
    });
  }
  return rows;
}
