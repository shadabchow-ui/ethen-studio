import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "@ethen/contracts/tools/types";
import { validateGovernedToolDefinitions } from "./validate-tool-definition";

export * from "./tool-definition";
export * from "./validate-tool-definition";

interface PackageJsonShape {
  version?: string;
}

export const EXECUTABLE_WRITE_GOVERNANCE_OVERRIDES = {
  "shell.run": {
    ownerTeam: "coding-platform",
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
    ownerTeam: "coding-platform",
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

let cachedSemanticVersion: string | null = null;

export function readGovernedToolSemanticVersion(): string {
  if (cachedSemanticVersion) {
    return cachedSemanticVersion;
  }

  const packageJsonPath = path.join(process.cwd(), "package.json");
  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as PackageJsonShape;

  if (!parsed.version) {
    throw new Error("package.json version is required for governed tool semanticVersion.");
  }

  cachedSemanticVersion = parsed.version;
  return cachedSemanticVersion;
}

export function validateGovernedToolRegistryOrThrow(
  tools: ToolDefinition[],
): void {
  const result = validateGovernedToolDefinitions(tools, {
    semanticVersion: readGovernedToolSemanticVersion(),
    overrides: EXECUTABLE_WRITE_GOVERNANCE_OVERRIDES,
  });

  const errors = result.issues.filter((issue) => issue.severity === "error");
  if (errors.length === 0) {
    return;
  }

  const summary = errors
    .map((issue) => `[${issue.toolId}] ${issue.code}: ${issue.message}`)
    .join("; ");
  throw new Error(`Governed tool registry validation failed: ${summary}`);
}
