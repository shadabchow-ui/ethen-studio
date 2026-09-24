import type {
  AutonomyLevel,
  BusinessProfile,
  EmployeeProfile,
  EmployeeRole,
  EmployeeStatus,
} from "./types";

export const EMPLOYEE_STATUS_ORDER: EmployeeStatus[] = [
  "draft",
  "active",
  "paused",
  "error",
  "archived",
];

export function createDefaultBusinessProfile(overrides?: Partial<BusinessProfile>): BusinessProfile {
  return {
    id: "",
    orgId: "",
    organizationName: "",
    timezone: "UTC",
    businessHours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
    productsAndServices: [],
    customerSegments: [],
    policies: [],
    sensitiveDataRules: [],
    ownerUserId: "",
    reviewerUserIds: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createDefaultEmployeeProfile(overrides?: Partial<EmployeeProfile>): EmployeeProfile {
  return {
    id: "",
    orgId: "",
    businessProfileId: "",
    name: "",
    role: "operations" as EmployeeRole,
    description: "",
    responsibilities: [],
    nonGoals: [],
    status: "draft" as EmployeeStatus,
    autonomyLevel: 0 as AutonomyLevel,
    skillPackIds: [],
    connectedAppIds: [],
    allowedToolIds: [],
    blockedToolIds: [],
    scheduleIds: [],
    ownerUserId: "",
    reviewerUserIds: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function validateEmployeeProfile(
  profile: Partial<EmployeeProfile>,
): string[] {
  const errors: string[] = [];
  if (!profile.name || profile.name.trim().length === 0) {
    errors.push("Employee name is required");
  }
  if (!profile.orgId) {
    errors.push("Organization ID is required");
  }
  if (!profile.businessProfileId) {
    errors.push("Business profile ID is required");
  }
  if (!profile.ownerUserId) {
    errors.push("Owner user ID is required");
  }
  return errors;
}

export function isEmployeeReady(profile: EmployeeProfile): boolean {
  return (
    profile.status === "active" &&
    profile.name.trim().length > 0 &&
    profile.ownerUserId.length > 0 &&
    profile.businessProfileId.length > 0
  );
}

export const FAIL_CLOSED_DEFAULTS = {
  autonomy: {
    min: 0 as AutonomyLevel,
    max: 4 as AutonomyLevel,
    blocked: [5],
  },
  status: {
    requiresSetup: ["draft"] as EmployeeStatus[],
    safeToRun: ["active"] as EmployeeStatus[],
  },
};
