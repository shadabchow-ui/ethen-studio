// ── Live connector readiness checks ─────────────────────────────────────────
//
// Every connector must pass readiness gating before it can move beyond mock
// mode. This module provides honest, fail-closed readiness assessments that
// tie together credential status, connector definition status, trust states,
// and the execution boundary.
//
// Execute mode is always blocked in this job. Live readiness only reports
// whether the SETUP PATH is clear — it does not unlock execution.

import type { ConnectorDefinition } from "./connector-registry";
import type {
  CredentialRecord,
  CredentialStatus,
  LiveConnectorReadiness,
  ConnectorReadinessState,
} from "./credential-types";
import { isVaultConfigured } from "./vault";

// ── Status gating ────────────────────────────────────────────────────────────

/** Credential statuses that are considered "unusable" for live operations. */
const UNUSABLE_CREDENTIAL_STATUSES: Set<CredentialStatus> = new Set([
  "missing",
  "invalid",
  "expired",
  "revoked",
  "blocked",
]);

/** Connector-level statuses that allow a live readiness path. */
const LIVE_CAPABLE_CONNECTOR_STATUSES: Set<string> = new Set([
  "live",
  "degraded",
]);

// ── Readiness assessment ─────────────────────────────────────────────────────

/**
 * Evaluate whether a connector is ready for live operations based on its
 * definition, credential record, and the execution boundary.
 *
 * Returns an honest assessment:
 * - Setup-required connectors with no credential → setup required
 * - Mock connectors → ready for mock only
 * - Live connectors with configured credentials → live ready (execute still blocked)
 * - Any execute check → always false in this job
 */
export function getConnectorLiveReadiness(
  definition: ConnectorDefinition,
  credential: CredentialRecord | null,
): LiveConnectorReadiness {
  const now = new Date().toISOString();
  const base: Omit<LiveConnectorReadiness, "reason"> = {
    connectorId: definition.id,
    ready: false,
    credentialStatus: credential?.metadata.status ?? "missing",
    checkedAt: now,
    setupRequired: true,
    allowExecute: false,
  };

  // No definition means we cannot assess
  if (!definition) {
    return {
      ...base,
      reason: "Connector definition not found — cannot assess readiness.",
    };
  }

  // Mock connectors with mock/no credential → ready for mock, but not live
  if (definition.isMock && definition.status === "mock") {
    if (!credential || credential.metadata.status === "missing" || credential.metadata.status === "mock") {
      return {
        ...base,
        credentialStatus: credential?.metadata.status ?? "missing",
        ready: false,
        setupRequired: false,
        reason:
          "Connector is mock-only. No live credentials are needed. " +
          "Mock/demo operations are allowed; live execution is blocked.",
      };
    }
  }

  // Connector requires setup by definition
  if (definition.requiresSetup) {
    // No credential at all
    if (!credential) {
      return {
        ...base,
        credentialStatus: "missing",
        ready: false,
        setupRequired: true,
        reason:
          `Connector "${definition.id}" requires credential setup but no credential record exists. ` +
          "Register credentials before live use.",
      };
    }

    // Credential exists but has unusable status
    if (UNUSABLE_CREDENTIAL_STATUSES.has(credential.metadata.status)) {
      return {
        ...base,
        credentialStatus: credential.metadata.status,
        ready: false,
        setupRequired: true,
        reason:
          `Connector "${definition.id}" has credential status "${credential.metadata.status}". ` +
          "Credential must be 'configured' or 'mock' before live readiness.",
      };
    }

    // Credential is configured but connector status is not live-capable
    if (
      credential.metadata.status === "configured" &&
      !LIVE_CAPABLE_CONNECTOR_STATUSES.has(definition.status)
    ) {
      return {
        ...base,
        credentialStatus: credential.metadata.status,
        ready: false,
        setupRequired: false,
        reason:
          `Credential for "${definition.id}" is configured, but connector status is ` +
          `"${definition.status}" which does not support live mode. Connector must be ` +
          `"live" or "degraded" to proceed.`,
      };
    }

    // Credential is configured AND connector is live-capable → ready
    if (
      credential.metadata.status === "configured" &&
      LIVE_CAPABLE_CONNECTOR_STATUSES.has(definition.status)
    ) {
      return {
        ...base,
        credentialStatus: "configured",
        ready: true,
        setupRequired: false,
        reason:
          `Credential for "${definition.id}" is configured and connector status is ` +
          `"${definition.status}". Live path is clear. Execute mode remains blocked ` +
          "pending future production enablement.",
      };
    }

    // Fallback — anything else is considered setup-required
    return {
      ...base,
      credentialStatus: credential.metadata.status,
      ready: false,
      setupRequired: true,
      reason:
        `Connector "${definition.id}" has credential status "${credential.metadata.status}" ` +
        `and connector status "${definition.status}". Additional configuration required.`,
    };
  }

  // Connector does not require setup (e.g. csv-upload) — ready without credentials
  return {
    ...base,
    credentialStatus: "missing",
    ready: false,
    setupRequired: false,
    reason:
      `Connector "${definition.id}" does not require credential setup. ` +
      "Mock/demo operations are allowed; live execution is blocked.",
  };
}

// ── Setup-required helper ────────────────────────────────────────────────────

/**
 * Returns true if the connector requires credential setup before any live
 * operation. Factors in both the connector definition and the credential state.
 */
export function isConnectorSetupRequired(
  definition: ConnectorDefinition,
  credential: CredentialRecord | null,
): boolean {
  const readiness = getConnectorLiveReadiness(definition, credential);
  return readiness.setupRequired;
}

// ── Execute-allowed helper ───────────────────────────────────────────────────

/**
 * Returns true only when live readiness is confirmed AND execute mode has
 * been explicitly enabled by a future production job. Always returns false
 * in this job — execute remains blocked by default.
 */
export function isExecuteAllowed(
  _definition: ConnectorDefinition,
  _credential: CredentialRecord | null,
): boolean {
  void _definition;
  void _credential;
  return false;
}

// ── Readiness state computation ───────────────────────────────────────────────

/**
 * Compute the enriched connector readiness state by combining:
 * - vault availability (encryption infra required for any live op)
 * - credential record status
 * - connector definition status
 * - global execute block
 *
 * Returns an honest `ConnectorReadinessState` that can be displayed in the UI
 * and used for runtime gating decisions.
 */
export function computeConnectorReadinessState(
  definition: ConnectorDefinition,
  credential: CredentialRecord | null,
): { state: ConnectorReadinessState; reason: string } {
  if (!isVaultConfigured()) {
    return {
      state: "vault_unavailable",
      reason:
        "Token encryption vault is not configured. All live operations are blocked " +
        "until TOKEN_ENCRYPTION_KEY is provisioned.",
    };
  }

  if (definition.isMock && definition.status === "mock") {
    if (!credential || credential.metadata.status === "missing" || credential.metadata.status === "mock") {
      return {
        state: "mock",
        reason: "Connector is mock-only. No live credentials are needed. Demo/mock data is active.",
      };
    }
  }

  if (definition.status === "unavailable") {
    return {
      state: "vault_unavailable",
      reason: `Connector "${definition.id}" is marked unavailable.`,
    };
  }

  if (!credential || credential.metadata.status === "missing") {
    return {
      state: "not_connected",
      reason:
        `No credential record exists for "${definition.id}". Register credentials before use.`,
    };
  }

  if (credential.metadata.status === "mock") {
    return { state: "mock", reason: "Credential is mock-only." };
  }

  if (
    credential.metadata.status === "invalid" ||
    credential.metadata.status === "expired" ||
    credential.metadata.status === "revoked" ||
    credential.metadata.status === "blocked"
  ) {
    return {
      state: "not_connected",
      reason:
        `Credential for "${definition.id}" has status "${credential.metadata.status}". ` +
        "Reconfigure or replace the credential before use.",
    };
  }

  if (credential.metadata.status === "vault_unavailable") {
    return {
      state: "vault_unavailable",
      reason: "Encryption vault is not available. Credentials cannot be used for live operations.",
    };
  }

  if (definition.status === "setup-required" || definition.status === "planned") {
    return {
      state: "not_connected",
      reason:
        `Connector "${definition.id}" is "${definition.status}" — not yet ready for live use.`,
    };
  }

  if (credential.metadata.status === "configured") {
    if (!isExecuteAllowed(definition, credential)) {
      return {
        state: "connected_read_only",
        reason:
          `Credential for "${definition.id}" is configured. Read-only operations are allowed. ` +
          "Write and execute modes are blocked pending policy, approval, and future enablement.",
      };
    }
    return {
      state: "connected_read_only",
      reason:
        "Credential is configured but execute mode remains globally disabled.",
    };
  }

  return {
    state: "not_connected",
    reason: `Connector "${definition.id}" readiness cannot be determined. Status: ${definition.status}.`,
  };
}

// ── Read-only path gate ───────────────────────────────────────────────────────

/**
 * Returns true only when the connector is ready for read-only live operations.
 * Factors in vault availability, credential status, and connector definition.
 */
export function isConnectorReadOnlyReady(
  definition: ConnectorDefinition,
  credential: CredentialRecord | null,
): { allowed: boolean; state: ConnectorReadinessState; reason: string } {
  const { state, reason } = computeConnectorReadinessState(definition, credential);

  if (state === "connected_read_only" || state === "mock") {
    return { allowed: true, state, reason: "Read-only operations are permitted." };
  }

  return {
    allowed: false,
    state,
    reason: `Read-only operations are blocked: ${reason}`,
  };
}

// ── Write capability check ────────────────────────────────────────────────────

/**
 * Returns true only when ALL write prerequisites are met:
 * - Vault is configured
 * - Credential is configured (not mock, not missing)
 * - Connector is live-capable
 * - Execute mode is enabled (currently always false)
 * - Approval is satisfied
 *
 * Since execute mode is globally blocked and approval requires a proposal,
 * this function always returns false in the current implementation state.
 */
export function canConnectorWrite(
  definition: ConnectorDefinition,
  credential: CredentialRecord | null,
  _approvalSatisfied?: boolean,
): { allowed: boolean; reason: string } {
  if (!isVaultConfigured()) {
    return { allowed: false, reason: "Token vault is not configured — all live writes are blocked." };
  }

  if (!credential || credential.metadata.status !== "configured") {
    return {
      allowed: false,
      reason: `Credential for "${definition.id}" is not in 'configured' status. Write operations require configured credentials.`,
    };
  }

  if (definition.isMock || definition.status !== "live") {
    return {
      allowed: false,
      reason: `Connector "${definition.id}" is "${definition.status}" — write capability requires 'live' status.`,
    };
  }

  if (!isExecuteAllowed(definition, credential)) {
    return {
      allowed: false,
      reason: "Execute mode is globally blocked. Real external writes are not yet enabled.",
    };
  }

  if (_approvalSatisfied !== true) {
    return {
      allowed: false,
      reason: "Approval is required for all state-changing actions. No approved proposal found.",
    };
  }

  return { allowed: true, reason: "All write prerequisites are met." };
}
