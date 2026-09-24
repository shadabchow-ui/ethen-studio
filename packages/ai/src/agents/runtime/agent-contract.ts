/**
 * SP-04 / ETHEN-READY-013 — Canonical Executable-Agent Contract
 *
 * Distinguishes catalog records (seed metadata / portfolio entries) from real
 * executable flagship agents by defining a typed execution contract that every
 * agent must satisfy before it can run on the shared durable run envelope.
 *
 * The contract covers:
 *   1.  Typed input schema (structured intake fields)
 *   2.  Explicit tool grants (allowed + disallowed tools)
 *   3.  Structured output schema (artifact types + evidence types emitted)
 *   4.  Evidence emission (run-time evidence the agent must produce)
 *   5.  Approval binding (autonomy level, which risk levels require approval)
 *   6.  Cost & token ceiling (budget limits before forced termination)
 *   7.  Loop termination & no-progress detection (max iterations, stall timeout)
 *
 * implementationStatus is DERIVED from executable evidence, never hand-set.
 */

import type { ToolId } from "@ethen/contracts/tools/types";
import type {
  AgentRegistryEntry,
  AgentRun,
  FunctionalAgentSpec,
  FunctionalAgentApprovalBoundary,
  FunctionalAgentActionRiskLevel,
  FunctionalAgentArtifactType,
  FunctionalAgentEvidenceType,
} from "./types";
import { listEntries } from "./registry";
import { getFunctionalAgentSpec } from "./functional-registry";

// ── Contract Types ───────────────────────────────────────────────────────────

/** A single structured intake field. Maps 1:1 to FunctionalAgentSpec structuredIntakeFields. */
export interface ContractInputField {
  name: string;
  type: "text" | "file" | "select" | "number" | "boolean" | "json";
  required: boolean;
  description: string;
  /** Optional default value. */
  defaultValue?: unknown;
  /** Optional validation regex or enum of allowed values. */
  validation?: string | string[];
}

/** Tool grant — which tools are allowed, which risk levels require approval. */
export interface ContractToolGrant {
  /** Tool IDs explicitly granted. Empty = all allowed unless denied. */
  allowedToolIds: ToolId[];
  /** Tool IDs explicitly denied even if in allowedToolIds. */
  deniedToolIds: ToolId[];
  /** Risk levels that require human approval before execution. */
  requireApprovalFor: FunctionalAgentActionRiskLevel[];
  /** Risk levels that are blocked entirely. */
  blockActions: FunctionalAgentActionRiskLevel[];
}

/** Structured output schema — what artifact and evidence types the agent produces. */
export interface ContractOutputSchema {
  /** Artifact types the agent may produce. */
  artifactTypes: FunctionalAgentArtifactType[];
  /** Evidence types the agent may emit. */
  evidenceTypes: FunctionalAgentEvidenceType[];
}

/** Cost and token ceiling for a single run. */
export interface ContractBudgetCeiling {
  /** Maximum LLM tokens (input + output) before forced termination. 0 = unlimited. */
  maxTokens: number;
  /** Maximum cost in credits before forced termination. 0 = unlimited. */
  maxCredits: number;
  /** Maximum wall-clock seconds before forced termination. 0 = unlimited. */
  maxDurationSeconds: number;
  /** Maximum API calls before forced termination. 0 = unlimited. */
  maxApiCalls: number;
}

/** Loop termination and progress detection. */
export interface ContractLoopTermination {
  /** Maximum iterations of the agent loop before forced termination. */
  maxIterations: number;
  /** Consecutive iterations without meaningful progress before stall detection. */
  stallThreshold: number;
  /** Seconds of inactivity before the agent is considered stalled. */
  stallTimeoutSeconds: number;
  /** Whether the agent can detect and break out of infinite loops. */
  noProgressDetection: boolean;
}

/**
 * Canonical executable-agent contract.
 * Every agent that runs on the durable run envelope must satisfy this contract.
 */
export interface ExecutableAgentContract {
  /** Stable slug matching the agent registry entry. */
  slug: string;
  /** Human-readable contract version (semver). */
  contractVersion: string;

  // ── Typed input schema ──────────────────────────────────────────────
  /** Structured intake fields the agent accepts. Empty = no structured input (just a prompt). */
  intakeFields: ContractInputField[];

  // ── Explicit tool grants ─────────────────────────────────────────────
  /** Explicitly granted and denied tools. */
  toolGrants: ContractToolGrant;

  // ── Structured output schema ─────────────────────────────────────────
  /** What this agent produces. */
  outputSchema: ContractOutputSchema;

  // ── Approval binding ─────────────────────────────────────────────────
  /** Autonomy configuration for approval gates. */
  approvalBoundary: FunctionalAgentApprovalBoundary;

  // ── Cost & token ceiling ─────────────────────────────────────────────
  /** Budget limits for a single run. */
  budgetCeiling: ContractBudgetCeiling;

  // ── Loop termination & no-progress detection ─────────────────────────
  /** Loop termination and stall detection config. */
  loopTermination: ContractLoopTermination;

  // ── Evidence emission ────────────────────────────────────────────────
  /** Evidence types this agent is REQUIRED to emit on each run. */
  requiredEvidenceTypes: FunctionalAgentEvidenceType[];

  // ── Executable evidence (proves backend implementation exists) ────────
  /** Proof that this agent actually executes, not just a catalog entry. */
  executableEvidence: ExecutableEvidence;
}

/** Evidence that proves an agent has a real backend runtime implementation. */
export interface ExecutableEvidence {
  /** Whether the agent has a functional spec with defined workflows. */
  hasFunctionalSpec: boolean;
  /** Whether the agent has a workbench config with defined actions. */
  hasWorkbenchConfig: boolean;
  /** Whether the agent has a runtime runner registered. */
  hasRuntimeRunner: boolean;
  /** Whether the agent has a durable queue handler registered (SP-01). */
  hasDurableQueueHandler: boolean;
  /** Whether the agent has passing acceptance tests. */
  hasPassingAcceptanceTests: boolean;
  /** Optional URL or reference to the implementation location. */
  implementationRef?: string;
  /** Optional notes about the implementation status. */
  notes?: string;
}

// ── Implementation Status Derivation ─────────────────────────────────────────

/**
 * Derive implementation status from executable evidence.
 * NEVER hand-set — always computed from the actual evidence.
 */
export function deriveImplementationStatus(
  evidence: ExecutableEvidence,
): AgentRegistryEntry["implementationStatus"] {
  if (evidence.hasRuntimeRunner && evidence.hasDurableQueueHandler && evidence.hasPassingAcceptanceTests) {
    return "active";
  }
  if (evidence.hasFunctionalSpec || evidence.hasWorkbenchConfig || evidence.hasRuntimeRunner) {
    return "stub";
  }
  return "not_started";
}

// ── Contract Validation ───────────────────────────────────────────────────────

export interface ContractValidationResult {
  /** Whether the contract passes all validation gates. */
  valid: boolean;
  /** Per-gate validation results. */
  gates: ContractValidationGate[];
  /** Summary of issues found. */
  issues: string[];
}

export interface ContractValidationGate {
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * Validate a single contract for self-consistency.
 */
export function validateContract(contract: ExecutableAgentContract): ContractValidationResult {
  const gates: ContractValidationGate[] = [];
  const issues: string[] = [];

  // Gate 1: Slug must be non-empty
  if (contract.slug && contract.slug.length > 0) {
    gates.push({ name: "slug", passed: true, detail: `Slug: ${contract.slug}` });
  } else {
    gates.push({ name: "slug", passed: false, detail: "Slug is empty" });
    issues.push("Contract slug is empty");
  }

  // Gate 2: Contract version must be non-empty
  if (contract.contractVersion && contract.contractVersion.length > 0) {
    gates.push({ name: "contractVersion", passed: true, detail: `Version: ${contract.contractVersion}` });
  } else {
    gates.push({ name: "contractVersion", passed: false, detail: "Contract version is empty" });
    issues.push("Contract version is empty");
  }

  // Gate 3: Intake field names must be unique
  const fieldNames = new Set<string>();
  let fieldsUnique = true;
  for (const field of contract.intakeFields) {
    if (fieldNames.has(field.name)) {
      gates.push({ name: "intakeFields.unique", passed: false, detail: `Duplicate field: ${field.name}` });
      issues.push(`Duplicate intake field: ${field.name}`);
      fieldsUnique = false;
    }
    fieldNames.add(field.name);
  }
  if (fieldsUnique) {
    gates.push({ name: "intakeFields.unique", passed: true, detail: `${fieldNames.size} unique intake fields` });
  }

  // Gate 4: Tool grants must not have overlapping deny/allow
  const deniedInAllowed = contract.toolGrants.deniedToolIds.filter((id) =>
    contract.toolGrants.allowedToolIds.includes(id),
  );
  if (deniedInAllowed.length === 0) {
    gates.push({ name: "toolGrants.noConflict", passed: true, detail: "No tool grant conflicts" });
  } else {
    gates.push({ name: "toolGrants.noConflict", passed: false, detail: `Conflicting grants: ${deniedInAllowed.join(", ")}` });
    issues.push(`Tool ${deniedInAllowed.join(", ")} both allowed and denied`);
  }

  // Gate 5: Approval boundary must have valid autonomy level
  const autonomyLevel = contract.approvalBoundary.autonomyLevel;
  if (autonomyLevel >= 0 && autonomyLevel <= 5) {
    gates.push({ name: "approvalBoundary.autonomyLevel", passed: true, detail: `Autonomy: ${autonomyLevel}` });
  } else {
    gates.push({ name: "approvalBoundary.autonomyLevel", passed: false, detail: `Invalid autonomy level: ${autonomyLevel}` });
    issues.push(`Invalid autonomy level: ${autonomyLevel}`);
  }

  // Gate 6: Budget ceiling must have non-negative values
  const budgetOk =
    contract.budgetCeiling.maxTokens >= 0 &&
    contract.budgetCeiling.maxCredits >= 0 &&
    contract.budgetCeiling.maxDurationSeconds >= 0 &&
    contract.budgetCeiling.maxApiCalls >= 0;
  if (budgetOk) {
    gates.push({ name: "budgetCeiling.nonNegative", passed: true, detail: "All budget values non-negative" });
  } else {
    gates.push({ name: "budgetCeiling.nonNegative", passed: false, detail: "Budget has negative values" });
    issues.push("Budget ceiling has negative values");
  }

  // Gate 7: Loop termination must have positive maxIterations
  if (contract.loopTermination.maxIterations > 0) {
    gates.push({ name: "loopTermination.maxIterations", passed: true, detail: `Max iterations: ${contract.loopTermination.maxIterations}` });
  } else {
    gates.push({ name: "loopTermination.maxIterations", passed: false, detail: "maxIterations must be > 0" });
    issues.push("loopTermination.maxIterations must be > 0");
  }

  // Gate 8: Executable evidence must have at least one positive indicator to be stub+
  const hasAnyEvidence =
    contract.executableEvidence.hasFunctionalSpec ||
    contract.executableEvidence.hasWorkbenchConfig ||
    contract.executableEvidence.hasRuntimeRunner ||
    contract.executableEvidence.hasDurableQueueHandler ||
    contract.executableEvidence.hasPassingAcceptanceTests;

  const implStatus = deriveImplementationStatus(contract.executableEvidence);
  if (hasAnyEvidence) {
    gates.push({
      name: "executableEvidence",
      passed: true,
      detail: `Has executable evidence → implementationStatus: ${implStatus}`,
    });
  } else {
    gates.push({
      name: "executableEvidence",
      passed: true,
      detail: `No executable evidence yet → implementationStatus: ${implStatus}`,
    });
  }

  return {
    valid: issues.length === 0,
    gates,
    issues,
  };
}

// ── Contract Registry ─────────────────────────────────────────────────────────

/** Registered contracts keyed by agent slug. */
const contractRegistry = new Map<string, ExecutableAgentContract>();

/**
 * Register a contract. Returns true on success, false if slug already registered.
 */
export function registerContract(contract: ExecutableAgentContract): boolean {
  if (contractRegistry.has(contract.slug)) return false;
  contractRegistry.set(contract.slug, contract);
  return true;
}

/**
 * Get a contract by agent slug.
 */
export function getContract(slug: string): ExecutableAgentContract | undefined {
  return contractRegistry.get(slug);
}

/**
 * List all registered contracts.
 */
export function listContracts(): ExecutableAgentContract[] {
  return Array.from(contractRegistry.values()).sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Check if an agent slug has a registered contract.
 */
export function hasContract(slug: string): boolean {
  return contractRegistry.has(slug);
}

// ── Contract ↔ Registry Integration ──────────────────────────────────────────

/**
 * Compute the actual implementation status for a runtime registry entry
 * based on whether a contract exists with valid executable evidence.
 * This is the primary integration point — replaces hand-set implementationStatus.
 */
export function computeEffectiveImplementationStatus(
  entry: AgentRegistryEntry,
): AgentRegistryEntry["implementationStatus"] {
  const contract = getContract(entry.slug);
  if (!contract) return "not_started";

  const validation = validateContract(contract);
  if (!validation.valid) return "not_started";

  return deriveImplementationStatus(contract.executableEvidence);
}

/**
 * Get contracts mapped by their derived implementation status.
 * Replaces the old listEntriesByStatus which used hand-set values.
 */
export function listContractsByStatus(
  status: AgentRegistryEntry["implementationStatus"],
): ExecutableAgentContract[] {
  return listContracts().filter((c) => {
    const entry = listEntries().find((e) => e.slug === c.slug);
    if (!entry) return false;
    return computeEffectiveImplementationStatus(entry) === status;
  });
}

/**
 * List all active (executable) contracts.
 */
export function listActiveContracts(): ExecutableAgentContract[] {
  return listContractsByStatus("active");
}

// ── Functional Spec → Contract Builder ────────────────────────────────────────

/**
 * Build a contract from a functional agent spec.
 * This is the bridge that migrates existing functional specs onto the contract.
 */
export function buildContractFromFunctionalSpec(
  spec: FunctionalAgentSpec,
  evidence?: Partial<ExecutableEvidence>,
): ExecutableAgentContract {
  const intakeFields: ContractInputField[] = Object.entries(spec.structuredIntakeFields).map(
    ([name, field]) => ({
      name,
      type: field.type as ContractInputField["type"],
      required: field.required,
      description: field.description,
    }),
  );

  const defaultEvidence: ExecutableEvidence = {
    hasFunctionalSpec: true,
    hasWorkbenchConfig: false,
    hasRuntimeRunner: false,
    hasDurableQueueHandler: false,
    hasPassingAcceptanceTests: false,
    implementationRef: undefined,
    notes: "Built from functional spec; runtime implementation pending",
  };

  return {
    slug: spec.slug,
    contractVersion: "1.0.0",
    intakeFields,
    toolGrants: {
      allowedToolIds: ["agent.runtime"],
      deniedToolIds: [],
      requireApprovalFor: spec.approvalBoundary.requireApprovalFor,
      blockActions: spec.approvalBoundary.blockActions,
    },
    outputSchema: {
      artifactTypes: spec.generatedArtifactTypes,
      evidenceTypes: ["source_data", "report", "audit_snapshot"],
    },
    approvalBoundary: spec.approvalBoundary,
    budgetCeiling: {
      maxTokens: 100000,
      maxCredits: 10,
      maxDurationSeconds: 3600,
      maxApiCalls: 20,
    },
    loopTermination: {
      maxIterations: 25,
      stallThreshold: 3,
      stallTimeoutSeconds: 30,
      noProgressDetection: true,
    },
    requiredEvidenceTypes: ["source_data", "report"],
    executableEvidence: { ...defaultEvidence, ...evidence },
  };
}

/**
 * Build contracts for ALL registered functional specs that don't already have one.
 * Used for batch migration (e.g., migrating the 33 workbench configs).
 */
export function registerContractsForAllFunctionalSpecs(
  evidenceOverrides?: Record<string, Partial<ExecutableEvidence>>,
): number {
  const entries = listEntries();
  let registered = 0;

  for (const entry of entries) {
    if (hasContract(entry.slug)) continue;
    const spec = getFunctionalAgentSpec(entry.slug);
    if (!spec) continue;

    const override = evidenceOverrides?.[entry.slug];
    const contract = buildContractFromFunctionalSpec(spec, override);
    if (registerContract(contract)) {
      registered++;
    }
  }

  return registered;
}
