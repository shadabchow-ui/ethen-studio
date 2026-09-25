import "server-only";

/**
 * STUDIO_15 route-adapter composites access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed template/campaign/variant/review access over the j15 schema.
 * Service-role bypasses RLS, so every call binds explicit project scope.
 * Templates are append-only; campaigns/variants/reviews are scoped heads.
 */
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import { CompositeError } from "@ethen/studio-core/server/composites";
import { StudioSetupError, isSupabaseCredentialFault } from "@/lib/media/studio-setup";

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function int(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function nullableInt(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

function json(row: Row, key: string, fallback: unknown): unknown {
  const value = row[key];
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return fallback;
    }
  }
  return value;
}

export interface TemplateRow {
  templateId: string;
  version: number;
  kind: string;
  title: string;
  description: string;
  appId: string;
  aspects: string[];
  inputs: unknown;
  requiredIdentities: string[];
  contentHash: string;
  createdAt: string;
}

function toTemplateRow(row: Row): TemplateRow {
  return {
    templateId: str(row, "template_id"),
    version: int(row, "version"),
    kind: str(row, "kind"),
    title: str(row, "title"),
    description: str(row, "description"),
    appId: str(row, "app_id"),
    aspects: (row["aspects"] as string[] | null) ?? [],
    inputs: json(row, "inputs", []),
    requiredIdentities: (row["required_identities"] as string[] | null) ?? [],
    contentHash: str(row, "content_hash"),
    createdAt: str(row, "created_at"),
  };
}

export async function listTemplates(kind: string | null): Promise<TemplateRow[]> {
  const client = requireServiceClient();
  let query = client
    .from("studio_v5_composite_templates")
    .select("template_id,version,kind,title,description,app_id,aspects,inputs,required_identities,content_hash,created_at")
    .order("template_id", { ascending: true })
    .order("version", { ascending: true });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) {
    // S4C: a rotated/mismatched service key is a setup condition (503),
    // not a code crash (500) — the public templates read stays honest.
    if (isSupabaseCredentialFault(error.message)) throw new StudioSetupError("supabase");
    throw new CompositeError("INTERNAL", `Template list is unavailable: ${error.message}`);
  }
  return ((data ?? []) as Row[]).map(toTemplateRow);
}

export async function getTemplate(templateId: string, version: number): Promise<TemplateRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_composite_templates")
    .select("template_id,version,kind,title,description,app_id,aspects,inputs,required_identities,content_hash,created_at")
    .eq("template_id", templateId)
    .eq("version", version)
    .maybeSingle();
  if (error) throw new CompositeError("INTERNAL", `Template read is unavailable: ${error.message}`);
  return data ? toTemplateRow(data as Row) : null;
}

export interface CampaignRow {
  campaignId: string;
  kind: string;
  title: string;
  templateId: string | null;
  templateVersion: number | null;
  appId: string | null;
  brief: Record<string, unknown>;
  jobTreeId: string;
  status: string;
  briefRevision: number;
  updatedAt: string;
}

function toCampaignRow(row: Row): CampaignRow {
  return {
    campaignId: str(row, "campaign_id"),
    kind: str(row, "kind"),
    title: str(row, "title"),
    templateId: nullableStr(row, "template_id"),
    templateVersion: nullableInt(row, "template_version"),
    appId: nullableStr(row, "app_id"),
    brief: (json(row, "brief", {}) as Record<string, unknown>) ?? {},
    jobTreeId: str(row, "job_tree_id"),
    status: str(row, "status"),
    briefRevision: int(row, "brief_revision"),
    updatedAt: str(row, "updated_at"),
  };
}

export async function listCampaigns(scope: ResolvedScope, kind: string | null): Promise<CampaignRow[]> {
  const client = requireServiceClient();
  let query = client
    .from("studio_v5_campaigns")
    .select("campaign_id,kind,title,template_id,template_version,app_id,brief,job_tree_id,status,brief_revision,updated_at")
    .eq("project_id", scope.projectId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new CompositeError("INTERNAL", `Campaign list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toCampaignRow);
}

export async function getCampaign(scope: ResolvedScope, campaignId: string): Promise<CampaignRow | null> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_campaigns")
    .select("campaign_id,kind,title,template_id,template_version,app_id,brief,job_tree_id,status,brief_revision,updated_at")
    .eq("project_id", scope.projectId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new CompositeError("INTERNAL", `Campaign read is unavailable: ${error.message}`);
  return data ? toCampaignRow(data as Row) : null;
}

export interface InsertCampaignInput {
  scope: ResolvedScope;
  kind: string;
  title: string;
  templateId: string;
  templateVersion: number;
  appId: string;
  brief: Record<string, unknown>;
  idempotencyKey: string;
}

export async function insertCampaign(input: InsertCampaignInput): Promise<CampaignRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_campaigns")
    .upsert(
      {
        tenant_id: input.scope.tenantId,
        project_id: input.scope.projectId,
        kind: input.kind,
        title: input.title,
        template_id: input.templateId,
        template_version: input.templateVersion,
        app_id: input.appId,
        brief: input.brief,
        idempotency_key: input.idempotencyKey,
      },
      { onConflict: "project_id,idempotency_key" },
    )
    .select("campaign_id,kind,title,template_id,template_version,app_id,brief,job_tree_id,status,brief_revision,updated_at")
    .single();
  if (error) throw new CompositeError("INTERNAL", `Campaign create is unavailable: ${error.message}`);
  return toCampaignRow(data as Row);
}

export async function updateCampaignBrief(
  scope: ResolvedScope,
  campaignId: string,
  brief: Record<string, unknown>,
  expectedRevision: number,
): Promise<CampaignRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_campaigns")
    .update({ brief, brief_revision: expectedRevision + 1, status: "draft", updated_at: new Date().toISOString() })
    .eq("project_id", scope.projectId)
    .eq("campaign_id", campaignId)
    .eq("brief_revision", expectedRevision)
    .select("campaign_id,kind,title,template_id,template_version,app_id,brief,job_tree_id,status,brief_revision,updated_at")
    .maybeSingle();
  if (error) throw new CompositeError("INTERNAL", `Campaign update is unavailable: ${error.message}`);
  if (!data) throw new CompositeError("STALE_REVISION", "Campaign brief changed underneath this edit; reload and retry.");
  return toCampaignRow(data as Row);
}

export interface VariantRow {
  variantId: string;
  campaignId: string;
  aspectId: string;
  identities: unknown;
  payloadHash: string;
  variantRevision: number;
  estimatedCostIcu: number;
  jobId: string | null;
  status: string;
  refusalReason: string | null;
  updatedAt: string;
}

function toVariantRow(row: Row): VariantRow {
  return {
    variantId: str(row, "variant_id"),
    campaignId: str(row, "campaign_id"),
    aspectId: str(row, "aspect_id"),
    identities: json(row, "identities", []),
    payloadHash: str(row, "payload_hash"),
    variantRevision: int(row, "variant_revision"),
    estimatedCostIcu: int(row, "estimated_cost_icu"),
    jobId: nullableStr(row, "job_id"),
    status: str(row, "status"),
    refusalReason: nullableStr(row, "refusal_reason"),
    updatedAt: str(row, "updated_at"),
  };
}

export async function listVariants(scope: ResolvedScope, campaignId: string): Promise<VariantRow[]> {
  const campaign = await getCampaign(scope, campaignId);
  if (!campaign) throw new CompositeError("NOT_FOUND", "Campaign was not found.");
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_campaign_variants")
    .select("variant_id,campaign_id,aspect_id,identities,payload_hash,variant_revision,estimated_cost_icu,job_id,status,refusal_reason,updated_at")
    .eq("campaign_id", campaignId)
    .order("aspect_id", { ascending: true });
  if (error) throw new CompositeError("INTERNAL", `Variant list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toVariantRow);
}

export async function upsertVariant(row: {
  variantId: string;
  campaignId: string;
  aspectId: string;
  identities: unknown;
  payloadHash: string;
  estimatedCostIcu: number;
}): Promise<void> {
  const client = requireServiceClient();
  const { error } = await client.from("studio_v5_campaign_variants").upsert(
    {
      variant_id: row.variantId,
      campaign_id: row.campaignId,
      aspect_id: row.aspectId,
      identities: row.identities,
      payload_hash: row.payloadHash,
      estimated_cost_icu: row.estimatedCostIcu,
      status: "planned",
    },
    { onConflict: "variant_id" },
  );
  if (error) throw new CompositeError("INTERNAL", `Variant save is unavailable: ${error.message}`);
}

export interface ReviewRow {
  reviewId: string;
  campaignId: string;
  status: string;
  pinnedVariants: Record<string, string>;
  briefRevision: number;
  decidedBy: string | null;
  feedback: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

function toReviewRow(row: Row): ReviewRow {
  return {
    reviewId: str(row, "review_id"),
    campaignId: str(row, "campaign_id"),
    status: str(row, "status"),
    pinnedVariants: ((json(row, "pinned_variants", {}) as Record<string, string>) ?? {}),
    briefRevision: int(row, "brief_revision"),
    decidedBy: nullableStr(row, "decided_by"),
    feedback: nullableStr(row, "feedback"),
    expiresAt: nullableStr(row, "expires_at"),
    updatedAt: str(row, "updated_at"),
  };
}

export async function listReviews(scope: ResolvedScope, campaignId: string): Promise<ReviewRow[]> {
  const campaign = await getCampaign(scope, campaignId);
  if (!campaign) throw new CompositeError("NOT_FOUND", "Campaign was not found.");
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_campaign_reviews")
    .select("review_id,campaign_id,status,pinned_variants,brief_revision,decided_by,feedback,expires_at,updated_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw new CompositeError("INTERNAL", `Review list is unavailable: ${error.message}`);
  return ((data ?? []) as Row[]).map(toReviewRow);
}

export async function insertReview(row: {
  campaignId: string;
  pinnedVariants: Record<string, string>;
  briefRevision: number;
  expiresAt: string | null;
}): Promise<ReviewRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_campaign_reviews")
    .insert({
      campaign_id: row.campaignId,
      status: "requested",
      pinned_variants: row.pinnedVariants,
      brief_revision: row.briefRevision,
      expires_at: row.expiresAt,
    })
    .select("review_id,campaign_id,status,pinned_variants,brief_revision,decided_by,feedback,expires_at,updated_at")
    .single();
  if (error) throw new CompositeError("INTERNAL", `Review request is unavailable: ${error.message}`);
  return toReviewRow(data as Row);
}

export async function decideReviewRow(reviewId: string, decision: "approved" | "denied", decidedBy: string, feedback: string | null): Promise<ReviewRow> {
  const client = requireServiceClient();
  const { data, error } = await client
    .from("studio_v5_campaign_reviews")
    .update({ status: decision, decided_by: decidedBy, feedback, updated_at: new Date().toISOString() })
    .eq("review_id", reviewId)
    .eq("status", "requested")
    .select("review_id,campaign_id,status,pinned_variants,brief_revision,decided_by,feedback,expires_at,updated_at")
    .maybeSingle();
  if (error) throw new CompositeError("INTERNAL", `Review decision is unavailable: ${error.message}`);
  if (!data) throw new CompositeError("CONFLICT", "Review is no longer requested; reload and retry.");
  return toReviewRow(data as Row);
}
