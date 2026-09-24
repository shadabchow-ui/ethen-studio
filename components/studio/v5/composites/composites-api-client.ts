/**
 * STUDIO_15 — composites API client (client-safe fetch wrappers over the
 * V1 composites routes). Failures surface as typed CompositesApiError with
 * actionable status text, never silent empty.
 */

import type { CampaignView, ReviewView, TemplateView, VariantView } from "./types";

export class CompositesApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly dependency: string | null;
  constructor(status: number, code: string, message: string, dependency: string | null = null) {
    super(message);
    this.name = "CompositesApiError";
    this.status = status;
    this.code = code;
    this.dependency = dependency;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: T;
    error?: { code?: string; message?: string; details?: { dependency?: string } };
  } | null;
  if (!response.ok || !body?.ok) {
    throw new CompositesApiError(
      response.status,
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? `Request failed (${response.status}).`,
      body?.error?.details?.dependency ?? null,
    );
  }
  return body.data as T;
}

export interface TemplateListResponse {
  templates: TemplateView[];
}

export interface CampaignListResponse {
  campaigns: CampaignView[];
}

export interface CampaignDetailResponse {
  campaign: CampaignView;
  variants: VariantView[];
  reviews: ReviewView[];
}

export interface FanoutResponse {
  admitted: VariantView[];
  refused: { aspectId: string; reason: string; estimatedCostIcu: number }[];
  totalAdmittedIcu: number;
  jobTreeId: string;
}

export async function fetchTemplates(projectId: string, kind: string): Promise<TemplateView[]> {
  const data = await request<TemplateListResponse>(
    `/api/studio/v1/composites/templates?projectId=${encodeURIComponent(projectId)}&kind=${encodeURIComponent(kind)}`,
  );
  return data.templates;
}

export async function fetchCampaigns(projectId: string, kind: string): Promise<CampaignView[]> {
  const data = await request<CampaignListResponse>(
    `/api/studio/v1/composites/campaigns?projectId=${encodeURIComponent(projectId)}&kind=${encodeURIComponent(kind)}`,
  );
  return data.campaigns;
}

export async function fetchCampaignDetail(projectId: string, campaignId: string): Promise<CampaignDetailResponse> {
  return request<CampaignDetailResponse>(
    `/api/studio/v1/composites/campaigns/${encodeURIComponent(campaignId)}?projectId=${encodeURIComponent(projectId)}`,
  );
}

export interface CreateCampaignInput {
  projectId: string;
  kind: string;
  title: string;
  templateId: string;
  templateVersion: number;
  appId: string;
  brief: { audience: string; hook: string; cta: string; caption: string; soundtrackAssetId: string | null; capIcu: number };
  idempotencyKey: string;
}

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignView> {
  const data = await request<{ campaign: CampaignView }>("/api/studio/v1/composites/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.campaign;
}

export async function fanoutVariants(input: {
  projectId: string;
  campaignId: string;
  aspectIds: string[];
  identities: { identityId: string; version: number | null }[];
  costEstimateIcuByAspect: Record<string, number>;
}): Promise<FanoutResponse> {
  return request<FanoutResponse>(
    `/api/studio/v1/composites/campaigns/${encodeURIComponent(input.campaignId)}/variants`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function requestReview(input: {
  projectId: string;
  campaignId: string;
  expiresAt: string | null;
}): Promise<ReviewView> {
  const data = await request<{ review: ReviewView }>(
    `/api/studio/v1/composites/campaigns/${encodeURIComponent(input.campaignId)}/reviews`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return data.review;
}

export async function decideReview(input: {
  projectId: string;
  campaignId: string;
  reviewId: string;
  decision: "approved" | "denied";
  feedback: string | null;
}): Promise<ReviewView> {
  const data = await request<{ review: ReviewView }>(
    `/api/studio/v1/composites/campaigns/${encodeURIComponent(input.campaignId)}/reviews`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return data.review;
}
