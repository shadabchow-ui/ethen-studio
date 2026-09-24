import type {
  ConnectorManifest,
  ConnectorActionManifest,
  ActionInputSchemaField,
  ConnectorAuthType,
  ConnectorState,
  ConnectorRateLimit,
} from "./types";
import type { ToolRiskLevel, ApprovalRequirement } from "@ethen/contracts/tools/types";
import type { ProviderId } from "../types";
import { validateManifest } from "./validation";
import type { ValidationResult } from "./types";

export interface DefineConnectorInput {
  id: string;
  providerId: ProviderId;
  name: string;
  category: string;
  description: string;
  authType: ConnectorAuthType;
  baseUrlMetadata?: string;
  state?: ConnectorState;
}

export interface DefineActionInput {
  id: string;
  name: string;
  description: string;
  inputSchema: ActionInputSchemaField[];
  outputSummary: string;
  riskTier: ToolRiskLevel;
  approvalRequirement?: ApprovalRequirement;
  rateLimit?: ConnectorRateLimit;
  state?: ConnectorState;
}

function defaultApprovalForRisk(riskTier: ToolRiskLevel): ApprovalRequirement {
  switch (riskTier) {
    case "read_only":
      return "no_approval";
    case "write":
    case "writes_user_content":
      return "confirm_once";
    case "external_side_effect":
    case "destructive":
      return "confirm_every_time";
    case "privileged":
      return "blocked";
  }
}

export function defineAction(input: DefineActionInput): ConnectorActionManifest {
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    inputSchema: input.inputSchema,
    outputSummary: input.outputSummary,
    riskTier: input.riskTier,
    approvalRequirement: input.approvalRequirement ?? defaultApprovalForRisk(input.riskTier),
    rateLimit: input.rateLimit,
    state: input.state ?? "not_configured",
  };
}

export function defineConnector(
  input: DefineConnectorInput,
  actions: ConnectorActionManifest[],
): ConnectorManifest {
  return {
    id: input.id,
    providerId: input.providerId,
    name: input.name,
    category: input.category,
    description: input.description,
    authType: input.authType,
    baseUrlMetadata: input.baseUrlMetadata,
    actions,
    state: input.state ?? "not_configured",
  };
}

export function defineAndValidateConnector(
  input: DefineConnectorInput,
  actions: ConnectorActionManifest[],
): { manifest: ConnectorManifest; validation: ValidationResult } {
  const manifest = defineConnector(input, actions);
  const validation = validateManifest(manifest);
  return { manifest, validation };
}
