import type { ConnectorManifest, ValidationResult } from "./types";

const ID_PATTERN = /^[a-z][a-z0-9_-]{1,63}$/;

const VALID_RISK_TIERS = new Set([
  "read_only",
  "write",
  "writes_user_content",
  "external_side_effect",
  "destructive",
  "privileged",
]);

const VALID_APPROVAL_REQUIREMENTS = new Set([
  "no_approval",
  "confirm_once",
  "confirm_every_time",
  "blocked",
]);

const WRITE_CLASSIFICATIONS = new Set([
  "write",
  "writes_user_content",
  "external_side_effect",
  "destructive",
  "privileged",
]);

export function validateConnectorId(id: string): string | null {
  if (!id || !ID_PATTERN.test(id)) {
    return `Invalid connector id "${id}". Must be 2-64 chars, lowercase alphanumeric with hyphens/underscores, starting with a letter.`;
  }
  return null;
}

export function validateActionId(id: string): string | null {
  if (!id || typeof id !== "string" || !id.includes(".")) {
    return `Invalid action id "${id}". Must be dot-namespaced (e.g. "provider.action_name").`;
  }
  const parts = id.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return `Invalid action id "${id}". Must have exactly one dot separating provider and action names.`;
  }
  const providerPart = parts[0];
  const actionPart = parts[1];
  if (!ID_PATTERN.test(providerPart)) {
    return `Invalid provider prefix "${providerPart}" in action id "${id}".`;
  }
  if (!ID_PATTERN.test(actionPart)) {
    return `Invalid action name "${actionPart}" in action id "${id}".`;
  }
  return null;
}

export function validateRiskTier(tier: string): string | null {
  if (!VALID_RISK_TIERS.has(tier)) {
    return `Invalid risk tier "${tier}". Must be one of: ${[...VALID_RISK_TIERS].join(", ")}.`;
  }
  return null;
}

export function validateApprovalRequirement(req: string): string | null {
  if (!VALID_APPROVAL_REQUIREMENTS.has(req)) {
    return `Invalid approval requirement "${req}". Must be one of: ${[...VALID_APPROVAL_REQUIREMENTS].join(", ")}.`;
  }
  return null;
}

export function validateActionApprovalForRiskTier(
  riskTier: string,
  approvalRequirement: string,
): string | null {
  if (WRITE_CLASSIFICATIONS.has(riskTier) && approvalRequirement === "no_approval") {
    return `Risk tier "${riskTier}" requires approval but got "no_approval". Write/destructive/admin actions must require approval.`;
  }
  if (riskTier === "read_only" && approvalRequirement !== "no_approval") {
    return null;
  }
  return null;
}

export function validateManifest(manifest: ConnectorManifest): ValidationResult {
  const errors: string[] = [];

  const idErr = validateConnectorId(manifest.id);
  if (idErr) errors.push(idErr);

  if (!manifest.name || !manifest.name.trim()) {
    errors.push("Connector name is required.");
  }

  if (!manifest.providerId || !manifest.providerId.trim()) {
    errors.push("Provider ID is required.");
  }

  if (!manifest.actions || manifest.actions.length === 0) {
    errors.push("Connector must define at least one action.");
  }

  const seenActionIds = new Set<string>();

  for (const action of manifest.actions) {
    const actionIdErr = validateActionId(action.id);
    if (actionIdErr) {
      errors.push(actionIdErr);
    }

    if (seenActionIds.has(action.id)) {
      errors.push(`Duplicate action id "${action.id}".`);
    }
    seenActionIds.add(action.id);

    if (!action.name || !action.name.trim()) {
      errors.push(`Action "${action.id}" missing name.`);
    }

    const riskErr = validateRiskTier(action.riskTier);
    if (riskErr) {
      errors.push(`Action "${action.id}": ${riskErr}`);
    }

    const appErr = validateApprovalRequirement(action.approvalRequirement);
    if (appErr) {
      errors.push(`Action "${action.id}": ${appErr}`);
    }

    const riskApprovalErr = validateActionApprovalForRiskTier(
      action.riskTier,
      action.approvalRequirement,
    );
    if (riskApprovalErr) {
      errors.push(`Action "${action.id}": ${riskApprovalErr}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateManifests(
  manifests: ConnectorManifest[],
): ValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenProviderIds = new Set<string>();

  for (const manifest of manifests) {
    if (seenIds.has(manifest.id)) {
      errors.push(`Duplicate connector id "${manifest.id}".`);
    }
    seenIds.add(manifest.id);

    if (seenProviderIds.has(manifest.providerId)) {
      errors.push(`Duplicate provider id "${manifest.providerId}".`);
    }
    seenProviderIds.add(manifest.providerId);

    const result = validateManifest(manifest);
    errors.push(...result.errors);
  }

  return { valid: errors.length === 0, errors };
}
