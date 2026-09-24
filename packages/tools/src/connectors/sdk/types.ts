import type { ToolRiskLevel, ApprovalRequirement } from "@ethen/contracts/tools/types";
import type { ProviderId } from "../types";

export type ConnectorAuthType =
  | "oauth2"
  | "api_key"
  | "basic"
  | "custom_header"
  | "webhook_signing_secret"
  | "none";

export type ConnectorRateLimitUnit = "second" | "minute" | "hour" | "day";

export interface ConnectorRateLimit {
  maxRequests: number;
  perUnit: ConnectorRateLimitUnit;
}

export type ConnectorState =
  | "available"
  | "not_configured"
  | "configured"
  | "coming_soon"
  | "disabled";

export interface ActionInputSchemaField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum" | "json" | "array";
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  enumValues?: string[];
}

export interface ConnectorActionManifest {
  id: string;
  name: string;
  description: string;
  inputSchema: ActionInputSchemaField[];
  outputSummary: string;
  riskTier: ToolRiskLevel;
  approvalRequirement: ApprovalRequirement;
  rateLimit?: ConnectorRateLimit;
  state: ConnectorState;
}

export interface ConnectorManifest {
  id: string;
  providerId: ProviderId;
  name: string;
  category: string;
  description: string;
  authType: ConnectorAuthType;
  baseUrlMetadata?: string;
  actions: ConnectorActionManifest[];
  state: ConnectorState;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ManifestRegistryEntry {
  manifest: ConnectorManifest;
  registeredAt: string;
}
