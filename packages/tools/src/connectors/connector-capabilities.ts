// ── Connector capability metadata — describes what a connector can do ────────
// Complements lib/connectors/types.ts (connection-level) and
// lib/agents/runtime/types.ts (runtime-level ConnectorDefinition).

/** Supported authentication modes for a connector provider. */
export type ConnectorAuthMode =
  | "oauth2"
  | "api_key"
  | "bearer_token"
  | "basic_auth"
  | "app_password"
  | "none";

/** Risk classification for a single connector capability. */
export type ConnectorCapabilityRiskLevel =
  | "read_only"
  | "writes_user_content"
  | "external_side_effect"
  | "destructive"
  | "privileged";

/** A single named capability a connector exposes. */
export interface ConnectorCapability {
  id: string;
  label: string;
  description: string;
  requiresAuth: boolean;
  riskLevel: ConnectorCapabilityRiskLevel;
  inputSummary: string;
  outputSummary: string;
  defaultActionMode: ConnectorActionMode;
}

import type { ConnectorActionMode } from "./mock-connector";
