export type EmployeeRole =
  | "customer_support"
  | "sales_operations"
  | "marketing_operations"
  | "research"
  | "operations"
  | "finance_operations"
  | "executive_assistant"
  | "developer_operations"
  | "custom";

export type EmployeeStatus =
  | "draft"
  | "active"
  | "paused"
  | "error"
  | "archived";

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

export interface BusinessHours {
  days: number[];
  start: string;
  end: string;
}

export interface BusinessProductService {
  name: string;
  description: string;
  pricingNotes?: string;
  policyNotes?: string;
}

export interface BusinessCustomerSegment {
  name: string;
  description: string;
  painPoints?: string[];
  objections?: string[];
}

export interface BusinessBrandVoice {
  tone: string;
  wordsToUse?: string[];
  wordsToAvoid?: string[];
  examples?: string[];
}

export interface BusinessPolicy {
  name: string;
  description: string;
  appliesToRoles?: EmployeeRole[];
  approvalRequiredFor?: string[];
  blockedActions?: string[];
}

export interface SensitiveDataRule {
  dataType: string;
  allowedRoles: EmployeeRole[];
  blockedTools?: string[];
}

export interface BusinessProfile {
  id: string;
  orgId: string;

  organizationName: string;
  website?: string;
  industry?: string;
  companySize?: "solo" | "startup" | "smb" | "mid_market" | "enterprise";

  timezone: string;
  businessHours: BusinessHours;

  productsAndServices: BusinessProductService[];
  customerSegments: BusinessCustomerSegment[];

  brandVoice?: BusinessBrandVoice;
  policies: BusinessPolicy[];
  sensitiveDataRules: SensitiveDataRule[];

  ownerUserId: string;
  reviewerUserIds: string[];

  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeProfile {
  id: string;
  orgId: string;
  businessProfileId: string;

  name: string;
  role: EmployeeRole;
  description: string;
  responsibilities: string[];
  nonGoals: string[];

  status: EmployeeStatus;
  autonomyLevel: AutonomyLevel;

  skillPackIds: string[];
  connectedAppIds: string[];
  allowedToolIds: string[];
  blockedToolIds: string[];

  approvalPolicyId?: string;
  budgetPolicyId?: string;
  scheduleIds: string[];

  ownerUserId: string;
  ownerTeamId?: string;
  reviewerUserIds: string[];

  version: number;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}
