// ── Connector framework barrel export ────────────────────────────────────────
// Exports the shared connector framework alongside existing connector primitives.

// Framework types — capability, status, action model
export {
  type ConnectorAuthMode,
  type ConnectorCapabilityRiskLevel,
  type ConnectorCapability,
} from "./connector-capabilities";

// Status and health
export {
  type ConnectorStatus,
  type ConnectorHealth,
  type ConnectorRateLimit,
} from "./connection-status";

// Mock connector and safe boundary
export {
  type ConnectorActionMode,
  type ConnectorExecutionBoundary,
  type ConnectorRequest,
  type ConnectorResponse,
  type ConnectorError,
  type ProposedAction,
  type MockConnectorConfig,
  DEFAULT_EXECUTION_BOUNDARY,
  runMockConnectorRequest,
  isExecutionAllowed,
  createMockConnector,
} from "./mock-connector";

// Registry and definitions
export {
  type ConnectorDefinition,
  type ConnectorCategory,
  ConnectorRegistry,
  connectorRegistry,
  getConnectorDefinition,
  listConnectorDefinitions,
  hasConnector,
  listConnectorsByCategory,
  listConnectorsByStatus,
} from "./connector-registry";

// Re-export existing connection-level types (no duplication)
export {
  type ProviderId,
  type ConnectionStatus as LegacyConnectionStatus,
  type TokenBundle,
  type ConnectionMetadata,
  type SafeConnection,
} from "./types";

// ── Credential vault abstraction ─────────────────────────────────────────────

export {
  type CredentialStatus,
  type CredentialSecretRef,
  type CredentialScope,
  type CredentialProvider,
  type CredentialMetadata,
  type CredentialRecord,
  type CredentialValidationResult,
  type RedactedCredential,
  type LiveConnectorReadiness,
  type ConnectorReadinessState,
  CREDENTIAL_STATUS_LABELS,
  CONNECTOR_READINESS_LABELS,
} from "./credential-types";

export {
  looksLikePlaintextSecret,
  assertNoPlaintextSecret,
  redactCredentialKey,
  redactCredentialRecord,
  redactCredentialMetadata,
  createMockCredentialRecord,
  validateCredentialMetadata,
} from "./credential-redaction";

export {
  getConnectorLiveReadiness,
  isConnectorSetupRequired,
  isExecuteAllowed,
  computeConnectorReadinessState,
  isConnectorReadOnlyReady,
  canConnectorWrite,
} from "./live-readiness";

export {
  CredentialVault,
  credentialVault,
  storeTokens,
  getTokens,
  updateTokens,
  deleteTokens,
  isVaultConfigured,
  isCredentialVaultSetupReady,
} from "./vault";

// ── Approval boundary helpers ────────────────────────────────────────────────
export {
  isConnectorExecutionApprovalSatisfied,
  getConnectorExecutionBlockReason,
  createConnectorApprovalRequest,
  recordConnectorBlockedAudit,
  type ConnectorApprovalCheckResult,
  type ConnectorExecutionBlockReason,
  type CreateConnectorApprovalRequestResult,
} from "./approval-boundary";
