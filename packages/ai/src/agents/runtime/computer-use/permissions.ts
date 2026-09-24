import type { PermissionScope, ComputerActionType, DomainPolicyMode } from "./types";
import { isDesktopActionType } from "./types";

export function createDefaultPermissionScope(overrides?: Partial<PermissionScope>): PermissionScope {
  return {
    accessMode: "guided-browser",
    domainPolicyMode: "restricted",
    allowedDomains: [],
    blockedDomains: [],
    allowedActions: ["screenshot", "click", "type", "scroll", "navigate", "wait", "double_click", "key", "dom_click", "dom_type", "drag", "extractText", "extractLinks", "extractHeadings", "extractTable"],
    approvalRequiredActions: [],
    blockedActions: [],
    credentialMode: "none",
    fileSystemScope: "none",
    networkMode: "allowlist",
    dataRetention: "session-only",
    maxSteps: 40,
    maxRuntimeMinutes: 15,
    ...overrides,
  };
}

export function createLocalhostScope(port?: number): PermissionScope {
  const domain = port ? `localhost:${port}` : "localhost";
  return createDefaultPermissionScope({
    allowedDomains: [domain, "127.0.0.1"],
    approvalRequiredActions: [],
    credentialMode: "none",
  });
}

export function createReadOnlyScope(overrides?: Partial<PermissionScope>): PermissionScope {
  return createDefaultPermissionScope({
    allowedActions: ["screenshot", "wait"],
    approvalRequiredActions: [],
    blockedActions: ["click", "type", "navigate", "scroll", "key", "dom_click", "dom_type", "double_click", "drag"],
    ...overrides,
  });
}

export function createGuidedBrowserScope(overrides?: Partial<PermissionScope>): PermissionScope {
  return createDefaultPermissionScope({
    approvalRequiredActions: [],
    credentialMode: "none",
    fileSystemScope: "none",
    ...overrides,
  });
}

export function isDesktopActionPermitted(actionType: ComputerActionType, scope: PermissionScope): boolean {
  if (!isDesktopActionType(actionType)) return false;
  return scope.allowedActions.includes(actionType) && !scope.blockedActions.includes(actionType);
}

export function blockAllDesktopActions(scope: PermissionScope): PermissionScope {
  const desktopBlocked = new Set(scope.blockedActions);
  for (const action of scope.allowedActions) {
    if (isDesktopActionType(action)) desktopBlocked.add(action);
  }
  for (const action of scope.approvalRequiredActions) {
    if (isDesktopActionType(action)) desktopBlocked.add(action);
  }
  return {
    ...scope,
    allowedActions: scope.allowedActions.filter((a) => !isDesktopActionType(a)),
    approvalRequiredActions: scope.approvalRequiredActions.filter((a) => !isDesktopActionType(a)),
    blockedActions: Array.from(desktopBlocked),
  };
}

function normalizeDomain(raw: string): string {
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^www\./, "").toLowerCase();
  }
}

export function isPublicHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function isDomainAllowed(url: string, scope: PermissionScope): boolean {
  if (!url) return false;

  const normalized = normalizeDomain(url);

  for (const blocked of scope.blockedDomains) {
    if (normalized === normalizeDomain(blocked)) return false;
    if (normalized.endsWith(`.${normalizeDomain(blocked)}`)) return false;
  }

  if (scope.domainPolicyMode === "open_web" && isPublicHttpUrl(url)) {
    return true;
  }

  if (scope.allowedDomains.length === 0) return false;

  for (const allowed of scope.allowedDomains) {
    const allowedNorm = normalizeDomain(allowed);
    if (normalized === allowedNorm) return true;
    if (normalized.endsWith(`.${allowedNorm}`)) return true;
  }

  return false;
}

export function isLocalhostUrl(url: string): boolean {
  const hostname = normalizeDomain(url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("127.") || hostname === "[::1]";
}

export function isActionAllowed(actionType: ComputerActionType, scope: PermissionScope): boolean {
  if (scope.blockedActions.includes(actionType)) return false;

  if (scope.allowedActions.length === 0) return true;

  return scope.allowedActions.includes(actionType);
}

export function isActionApprovalRequired(actionType: ComputerActionType, scope: PermissionScope): boolean {
  return scope.approvalRequiredActions.includes(actionType);
}

export function isActionBlocked(actionType: ComputerActionType, scope: PermissionScope): boolean {
  return scope.blockedActions.includes(actionType);
}

export function validatePermissionScope(scope: PermissionScope): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!scope.accessMode) {
    issues.push("accessMode is required");
  }

  if (scope.maxSteps < 1) {
    issues.push("maxSteps must be at least 1");
  }
  if (scope.maxRuntimeMinutes < 1) {
    issues.push("maxRuntimeMinutes must be at least 1");
  }
  if (scope.maxCostUsd !== undefined && scope.maxCostUsd < 0) {
    issues.push("maxCostUsd cannot be negative");
  }

  for (const action of scope.approvalRequiredActions) {
    if (scope.blockedActions.includes(action)) {
      issues.push(`Action "${action}" is both approval-required and blocked`);
    }
  }

  for (const action of scope.approvalRequiredActions) {
    if (scope.blockedActions.includes(action)) {
      issues.push(`Action "${action}" is in both approvalRequiredActions and blockedActions`);
    }
  }

  return { valid: issues.length === 0, issues };
}

export function summarizePermissionScope(scope: PermissionScope): { canDo: string[]; cannotDo: string[]; mode: string } {
  const canDo: string[] = [];
  const cannotDo: string[] = [];

  if (scope.allowedActions.length > 0) {
    canDo.push(`Perform actions: ${scope.allowedActions.join(", ")}`);
  }

  if (scope.allowedDomains.length > 0) {
    canDo.push(`Access domains: ${scope.allowedDomains.join(", ")}`);
  }

  if (scope.credentialMode === "none") {
    canDo.push("Work without credentials");
  } else if (scope.credentialMode === "takeover") {
    canDo.push("Request user takeover for login");
  }

  if (scope.blockedActions.length > 0) {
    cannotDo.push(`Perform: ${scope.blockedActions.join(", ")}`);
  }

  if (scope.blockedDomains.length > 0) {
    cannotDo.push(`Access domains: ${scope.blockedDomains.join(", ")}`);
  }

  if (scope.approvalRequiredActions.length > 0) {
    cannotDo.push(`Perform without approval: ${scope.approvalRequiredActions.join(", ")}`);
  }

  if (scope.credentialMode === "none") {
    cannotDo.push("Enter credentials or payment info");
  }

  if (scope.fileSystemScope === "none") {
    cannotDo.push("Download or upload files");
  }

  return { canDo, cannotDo, mode: scope.accessMode };
}
