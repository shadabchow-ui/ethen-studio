export type RepoMetadata = {
  root: string;
  name: string;
  branch: string | "unknown";
  headCommit: string | "unknown";
  packageManager?: string;
  framework?: string;
  scripts?: Record<string, string>;
};

export type TreeEntry = {
  path: string;
  type: "file" | "dir";
  size?: number;
};

export type ReadFileResult = {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
  redacted?: boolean;
  redactedSecretsCount?: number;
  sensitivePathWarning?: string;
};

export type SearchMatch = {
  path: string;
  line: number;
  text: string;
};

export type GitStatusEntry = {
  path: string;
  status: string;
};

export type GitStatusResult = {
  branch: string | "unknown";
  entries: GitStatusEntry[];
  note: string;
};

export type GitDiffResult = {
  /** Unified diff output text. May be empty if working tree is clean. */
  diff: string;
  /** Whether the output was truncated because it exceeded the safety cap. */
  truncated: boolean;
};

export type LocalRepoResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type PatchOperationKind = "add" | "update" | "delete";

export interface PatchOperation {
  kind: PatchOperationKind;
  filePath: string;
  content?: string;
}

export interface ParsedPatch {
  operations: PatchOperation[];
  errors: string[];
}

export interface FileProposePatchInput {
  runId: string;
  patch: string;
  reason: string;
  expectedFiles: string[];
  validationCommands?: string[];
  readFiles?: string[];
}

export interface FileProposePatchOutput {
  proposalId: string;
  status: PatchProposalStatus;
  affectedFiles: string[];
  previewDiff: string;
  policy: PatchPolicy;
  warnings: string[];
  error?: string;
}

export type PatchProposalStatus = "validated" | "rejected" | "requires_approval";

export interface PatchPolicy {
  riskLevel: "low" | "medium" | "high";
  secretPathsBlocked: boolean;
  pathTraversalBlocked: boolean;
  binaryBlocked: boolean;
  oversizedBlocked: boolean;
  readBeforeEditEnforced: boolean;
  readBeforeEditPassed: boolean;
}

export interface ReadRecord {
  path: string;
  contentHash: string;
  readAt: string;
}

export interface PatchApplyInput {
  runId: string;
  proposalId: string;
  approvalId?: string;
  approvalToken?: string;
  atomic?: boolean;
}

export interface PatchApplyOutput {
  patchId: string;
  status: "applied" | "failed" | "partial";
  appliedFiles: string[];
  failedFiles: string[];
  diffs: Record<string, string>;
  checkpointId: string;
  rollbackAvailable: boolean;
  verification: PatchVerificationOutput;
  errors: string[];
  beforeContentHashes: Record<string, string>;
  afterContentHashes: Record<string, string>;
}

export interface PatchVerificationOutput {
  verified: boolean;
  checks: PatchFileVerificationOutput[];
  summary: string;
}

export interface PatchFileVerificationOutput {
  filePath: string;
  verified: boolean;
  expectedHash: string;
  actualHash: string;
  contentMatches: boolean;
  error?: string;
}
