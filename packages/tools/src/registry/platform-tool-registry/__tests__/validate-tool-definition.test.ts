import type { ToolDefinition } from "@ethen/contracts/tools/types";
import { TOOL_REGISTRY } from "@ethen/tools/registry";
import {
  adaptToolDefinition,
  validateGovernedToolDefinitions,
  validateToolDefinition,
} from "../index";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    return;
  }

  failed += 1;
  console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    passed += 1;
    return;
  }

  failed += 1;
  console.error(
    `  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const EXECUTABLE_WRITE_OVERRIDES = {
  "shell.run": {
    reviewMetadata: {
      reviewRequired: true,
      reviewedBy: "coding-platform",
      notes: "Allowlisted validation-only shell surface.",
    },
    fmeaMetadata: {
      required: true,
      summary: "Command allowlist, approval gate, and risk classifier mitigate misuse.",
    },
  },
  "file.apply_patch": {
    reviewMetadata: {
      reviewRequired: true,
      reviewedBy: "coding-platform",
      notes: "Patch application remains approval-gated and checkpointed.",
    },
    fmeaMetadata: {
      required: true,
      summary: "Checkpoint, rollback, and verification reduce write-path risk.",
    },
  },
} as const;

function createBaseTool(overrides: Partial<ToolDefinition>): ToolDefinition {
  return {
    id: "research.search",
    name: "Web Search",
    description: "Search the web for sources matching a query.",
    category: "research",
    riskLevel: "read_only",
    readOnly: true,
    requiresApproval: false,
    approvalRequirement: "no_approval",
    executionState: "available",
    providerId: "exa",
    allowedAgentSlugs: [],
    allowedWorkspaceArchetypes: ["research"],
    inputSummary: "Query string and optional filters.",
    outputSummary: "List of web results.",
    ...overrides,
  };
}

console.log("\n[Governed Tool Definition]");
{
  const definition = adaptToolDefinition(createBaseTool({}), {
    semanticVersion: "0.1.0",
  });
  assertEqual(definition.semanticVersion, "0.1.0", "semanticVersion defaults from options");
  assertEqual(definition.ownerTeam, "research-platform", "owner team inferred from category");
  assertEqual(
    definition.executionStateHonesty.executable,
    true,
    "available tools stay executable in honesty layer",
  );
  assertEqual(
    definition.executionStateHonesty.setupRequiredIndicator,
    true,
    "provider-backed tools derive setup indicator",
  );
}

console.log("\n[Contradiction Guard]");
{
  const invalid = adaptToolDefinition(
    createBaseTool({
      readOnly: true,
      riskLevel: "writes_user_content",
      requiresApproval: true,
      approvalRequirement: "confirm_once",
    }),
    {
      semanticVersion: "0.1.0",
      overrides: {
        "research.search": {
          executionControls: {
            stateChanging: true,
          },
        },
      },
    },
  );
  const issues = validateToolDefinition(invalid);
  assert(
    issues.some((issue) => issue.code === "read_only_state_changing_conflict"),
    "readOnly/stateChanging contradiction fails closed",
  );
}

console.log("\n[Contract Honesty]");
{
  const contractOnly = adaptToolDefinition(
    createBaseTool({
      id: "artifact.read",
      name: "Read Artifact",
      category: "artifact",
      executionState: "contract_only",
      providerId: "supabase",
      inputSummary: "Artifact ID.",
      outputSummary: "Artifact content and metadata.",
    }),
    {
      semanticVersion: "0.1.0",
    },
  );
  assertEqual(
    contractOnly.executionStateHonesty.executable,
    false,
    "contract_only tools are not reported executable",
  );
}

console.log("\n[Executable Write Metadata]");
{
  const tool = TOOL_REGISTRY.find((entry) => entry.id === "file.apply_patch");
  assert(tool !== undefined, "file.apply_patch exists in source registry");
  if (tool) {
    const withoutMetadata = validateToolDefinition(
      adaptToolDefinition(tool, {
        semanticVersion: "0.1.0",
      }),
    );
    assert(
      withoutMetadata.some((issue) => issue.code === "missing_review_metadata"),
      "executable write tools require review metadata",
    );
    assert(
      withoutMetadata.some((issue) => issue.code === "missing_fmea_metadata"),
      "executable write tools require FMEA metadata",
    );
  }
}

console.log("\n[Registry Validation]");
{
  const result = validateGovernedToolDefinitions(TOOL_REGISTRY, {
    semanticVersion: "0.1.0",
    overrides: EXECUTABLE_WRITE_OVERRIDES,
  });
  assertEqual(result.summary.totalToolsChecked, TOOL_REGISTRY.length, "all tools validated");
  assertEqual(result.summary.validationErrors, 0, "current registry passes governed validation");
}

if (failed > 0) {
  console.error(`\nGoverned tool-definition tests failed: ${failed} failed, ${passed} passed.`);
  process.exit(1);
}

console.log(`\nGoverned tool-definition tests passed: ${passed} assertions.`);
