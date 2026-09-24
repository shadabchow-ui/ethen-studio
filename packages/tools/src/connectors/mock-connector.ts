// ── Mock connector implementation + safe Read → Propose → Execute boundary ──
//
// Every connector request follows a three-mode escalation path:
//   read    — return mock data (always allowed)
//   propose — return a proposed non-executing action (always allowed)
//   execute — BLOCKED — must never execute real mutations in this job
//
// Future live connectors must pass setup-required / trust gating before
// execute is unlocked.

import type { ConnectorCapability } from "./connector-capabilities";
import type { ConnectorRateLimit } from "./connection-status";

// ── Action mode ──────────────────────────────────────────────────────────────

/** Three-mode escalation path for every connector action. */
export type ConnectorActionMode = "read" | "propose" | "execute";

// ── Execution boundary ───────────────────────────────────────────────────────

/** Describes which modes are permitted and why execute is blocked. */
export interface ConnectorExecutionBoundary {
  allowedModes: ConnectorActionMode[];
  blockedModes: ConnectorActionMode[];
  reason: string;
}

/** Default fail-closed boundary — execute is always blocked. */
export const DEFAULT_EXECUTION_BOUNDARY: ConnectorExecutionBoundary = {
  allowedModes: ["read", "propose"],
  blockedModes: ["execute"],
  reason:
    "Execute is blocked by default. Live connectors require configured credentials, trust gating, and an approved execution plan before execute is unlocked.",
};

// ── Request / Response / Error shapes ────────────────────────────────────────

export interface ConnectorRequest {
  connectorId: string;
  capabilityId: string;
  actionMode: ConnectorActionMode;
  input: Record<string, unknown>;
  /** Optional idempotency key for deduplication. */
  idempotencyKey?: string | null;
}

export interface ConnectorResponse {
  success: boolean;
  actionMode: ConnectorActionMode;
  connectorId: string;
  capabilityId: string;
  /** Structured response payload — present when success is true. */
  data: Record<string, unknown> | null;
  /** Present when actionMode is "propose". */
  proposedAction?: ProposedAction | null;
  /** ISO 8601 timestamp of the response. */
  respondedAt: string;
  /** Rate-limit metadata from the underlying provider. */
  rateLimit: ConnectorRateLimit | null;
}

/** A non-executing proposed action returned in propose mode. */
export interface ProposedAction {
  id: string;
  title: string;
  description: string;
  expectedEffect: string;
  affectedEntities: string[];
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
  /** The input that would be submitted if approved. */
  proposedInput: Record<string, unknown>;
}

export interface ConnectorError {
  success: false;
  errorCode: string;
  message: string;
  connectorId: string;
  capabilityId: string;
  actionMode: ConnectorActionMode;
  /** HTTP-status-style code for categorisation. */
  statusCode: number;
  /** Whether the error is retryable. */
  retryable: boolean;
  /** ISO 8601 timestamp. */
  respondedAt: string;
  rateLimit: ConnectorRateLimit | null;
}

// ── Mock connector ───────────────────────────────────────────────────────────

/** Shape of a mock connector definition — id, name, and mock data fixtures. */
export interface MockConnectorConfig {
  id: string;
  displayName: string;
  capabilities: ConnectorCapability[];
  /** Map of capabilityId → mock response data. */
  mockData: Record<string, Record<string, unknown> | Record<string, unknown>[]>;
  /** Map of capabilityId → proposed action template. */
  mockProposals: Record<string, Omit<ProposedAction, "id" | "proposedInput">>;
  /** Optional rate-limit metadata to simulate. */
  simulatedRateLimit?: ConnectorRateLimit | null;
}

/**
 * Process a connector request through the safe boundary.
 *
 *   - read    → returns mockData for the capability
 *   - propose → returns a non-executing proposed action
 *   - execute → returns a blocked ConnectorError
 */
export function runMockConnectorRequest(
  config: MockConnectorConfig,
  request: ConnectorRequest,
): ConnectorResponse | ConnectorError {
  const now = new Date().toISOString();

  if (!isExecutionAllowed(request.actionMode)) {
    return {
      success: false,
      errorCode: "EXECUTION_BLOCKED",
      message:
        `Execute mode is blocked for connector "${request.connectorId}" ` +
        `capability "${request.capabilityId}". This connector runs in mock mode. ` +
        "Configure live credentials and pass trust gating before enabling execute.",
      connectorId: request.connectorId,
      capabilityId: request.capabilityId,
      actionMode: request.actionMode,
      statusCode: 403,
      retryable: false,
      respondedAt: now,
      rateLimit: config.simulatedRateLimit ?? null,
    };
  }

  const capability = config.capabilities.find(
    (c) => c.id === request.capabilityId,
  );

  if (!capability) {
    return {
      success: false,
      errorCode: "CAPABILITY_NOT_FOUND",
      message:
        `Capability "${request.capabilityId}" is not registered for connector "${request.connectorId}".`,
      connectorId: request.connectorId,
      capabilityId: request.capabilityId,
      actionMode: request.actionMode,
      statusCode: 404,
      retryable: false,
      respondedAt: now,
      rateLimit: config.simulatedRateLimit ?? null,
    };
  }

  if (request.actionMode === "propose") {
    const proposal = config.mockProposals[request.capabilityId] ?? {
      title: `Proposed action for ${capability.label}`,
      description: `This action would execute "${capability.label}" against ${config.displayName}.`,
      expectedEffect: "No data would be written — this is a mock proposal.",
      affectedEntities: [],
      riskLevel: capability.riskLevel === "read_only" ? "low" : "medium",
      requiresApproval: capability.riskLevel !== "read_only",
    };

    return {
      success: true,
      actionMode: "propose",
      connectorId: request.connectorId,
      capabilityId: request.capabilityId,
      data: null,
      proposedAction: {
        id: `prop_${request.connectorId}_${request.capabilityId}_${Date.now()}`,
        title: proposal.title,
        description: proposal.description,
        expectedEffect: proposal.expectedEffect,
        affectedEntities: proposal.affectedEntities,
        riskLevel: proposal.riskLevel,
        requiresApproval: proposal.requiresApproval,
        proposedInput: request.input,
      },
      respondedAt: now,
      rateLimit: config.simulatedRateLimit ?? null,
    };
  }

  // read mode — return mock data
  const mockPayload = config.mockData[request.capabilityId] ?? {
    _mock: true,
    message: `Mock data for "${request.capabilityId}" on "${request.connectorId}" is not seeded.`,
  };

  return {
    success: true,
    actionMode: "read",
    connectorId: request.connectorId,
    capabilityId: request.capabilityId,
    data: mockPayload as Record<string, unknown>,
    proposedAction: null,
    respondedAt: now,
    rateLimit: config.simulatedRateLimit ?? null,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function isExecutionAllowed(mode: ConnectorActionMode): boolean {
  return mode !== "execute";
}

export function createMockConnector(
  config: MockConnectorConfig,
): MockConnectorConfig {
  return config;
}
