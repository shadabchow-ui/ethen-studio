import type { BusinessProfile, EmployeeProfile } from "./types";

export interface EmployeeQueryResult {
  data: EmployeeProfile | null;
  error: string | null;
}

export interface EmployeeListQueryResult {
  data: EmployeeProfile[];
  error: string | null;
}

export interface BusinessProfileQueryResult {
  data: BusinessProfile | null;
  error: string | null;
}

export interface BusinessProfileListQueryResult {
  data: BusinessProfile[];
  error: string | null;
}

export function buildEmployeeInsertPayload(
  profile: Partial<EmployeeProfile>,
): Record<string, unknown> {
  return {
    org_id: profile.orgId,
    business_profile_id: profile.businessProfileId,
    name: profile.name,
    role: profile.role,
    description: profile.description,
    responsibilities: profile.responsibilities ?? [],
    non_goals: profile.nonGoals ?? [],
    status: profile.status ?? "draft",
    autonomy_level: profile.autonomyLevel ?? 0,
    skill_pack_ids: profile.skillPackIds ?? [],
    connected_app_ids: profile.connectedAppIds ?? [],
    allowed_tool_ids: profile.allowedToolIds ?? [],
    blocked_tool_ids: profile.blockedToolIds ?? [],
    approval_policy_id: profile.approvalPolicyId,
    budget_policy_id: profile.budgetPolicyId,
    schedule_ids: profile.scheduleIds ?? [],
    owner_user_id: profile.ownerUserId,
    owner_team_id: profile.ownerTeamId,
    reviewer_user_ids: profile.reviewerUserIds ?? [],
  };
}

export function buildEmployeeUpdatePayload(
  profile: Partial<EmployeeProfile>,
): Record<string, unknown> {
  const payload = buildEmployeeInsertPayload(profile);
  return payload;
}

export function buildBusinessProfileInsertPayload(
  profile: Partial<BusinessProfile>,
): Record<string, unknown> {
  return {
    org_id: profile.orgId,
    organization_name: profile.organizationName,
    website: profile.website,
    industry: profile.industry,
    company_size: profile.companySize,
    timezone: profile.timezone ?? "UTC",
    business_hours: profile.businessHours ?? { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
    products_and_services: profile.productsAndServices ?? [],
    customer_segments: profile.customerSegments ?? [],
    brand_voice: profile.brandVoice,
    policies: profile.policies ?? [],
    sensitive_data_rules: profile.sensitiveDataRules ?? [],
    owner_user_id: profile.ownerUserId,
    reviewer_user_ids: profile.reviewerUserIds ?? [],
  };
}

export function toEmployeeProfile(row: Record<string, unknown>): EmployeeProfile {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    businessProfileId: row.business_profile_id as string,
    name: row.name as string,
    role: row.role as EmployeeProfile["role"],
    description: row.description as string,
    responsibilities: (row.responsibilities ?? []) as string[],
    nonGoals: (row.non_goals ?? []) as string[],
    status: row.status as EmployeeProfile["status"],
    autonomyLevel: (row.autonomy_level ?? 0) as EmployeeProfile["autonomyLevel"],
    skillPackIds: (row.skill_pack_ids ?? []) as string[],
    connectedAppIds: (row.connected_app_ids ?? []) as string[],
    allowedToolIds: (row.allowed_tool_ids ?? []) as string[],
    blockedToolIds: (row.blocked_tool_ids ?? []) as string[],
    approvalPolicyId: row.approval_policy_id as string | undefined,
    budgetPolicyId: row.budget_policy_id as string | undefined,
    scheduleIds: (row.schedule_ids ?? []) as string[],
    ownerUserId: row.owner_user_id as string,
    ownerTeamId: row.owner_team_id as string | undefined,
    reviewerUserIds: (row.reviewer_user_ids ?? []) as string[],
    version: (row.version ?? 1) as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastActiveAt: row.last_active_at as string | undefined,
  };
}

export function toBusinessProfile(row: Record<string, unknown>): BusinessProfile {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    organizationName: row.organization_name as string,
    website: row.website as string | undefined,
    industry: row.industry as string | undefined,
    companySize: row.company_size as BusinessProfile["companySize"],
    timezone: (row.timezone ?? "UTC") as string,
    businessHours: (row.business_hours ?? { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }) as BusinessProfile["businessHours"],
    productsAndServices: (row.products_and_services ?? []) as BusinessProfile["productsAndServices"],
    customerSegments: (row.customer_segments ?? []) as BusinessProfile["customerSegments"],
    brandVoice: row.brand_voice as BusinessProfile["brandVoice"],
    policies: (row.policies ?? []) as BusinessProfile["policies"],
    sensitiveDataRules: (row.sensitive_data_rules ?? []) as BusinessProfile["sensitiveDataRules"],
    ownerUserId: row.owner_user_id as string,
    reviewerUserIds: (row.reviewer_user_ids ?? []) as string[],
    version: (row.version ?? 1) as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
