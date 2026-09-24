/**
 * Studio V2 Job 05 — versioned evaluation rubrics and deterministic tools.
 *
 * Three rubrics, all versioned, all inspectable:
 * - technical v1: deterministic container/dimension/hash checks (measured).
 * - preservation v1: locked attributes unchanged (measured against locks).
 * - subjective v1: no automatic tools by design — always needs-review.
 *   Subjective quality requires calibrated/human-reviewed evidence; this
 *   rubric never auto-passes, so unknown never masquerades as good.
 */

export interface RubricDefinition {
  name: string;
  version: string;
  tools: string[];
  autoPass: boolean;
}

export const RUBRIC_TECHNICAL_V1: RubricDefinition = {
  name: "technical", version: "v1",
  tools: ["container-ok", "dims-match", "hash-present"],
  autoPass: true,
};

export const RUBRIC_PRESERVATION_V1: RubricDefinition = {
  name: "preservation", version: "v1",
  tools: ["lock-intact"],
  autoPass: true,
};

export const RUBRIC_SUBJECTIVE_V1: RubricDefinition = {
  name: "subjective", version: "v1",
  tools: [],
  autoPass: false,
};

export const RUBRIC_TOOL_VERSIONS = Object.freeze({
  "container-ok": "v1",
  "dims-match": "v1",
  "hash-present": "v1",
  "lock-intact": "v1",
});

export type ToolOutcome = "pass" | "fail" | "unknown";

export interface ToolResult {
  tool: keyof typeof RUBRIC_TOOL_VERSIONS;
  version: string;
  outcome: ToolOutcome;
  detail: string;
}

export interface TechnicalInput {
  kind: "image" | "video";
  requestedSize?: string | null;
  actualWidth: number | null;
  actualHeight: number | null;
  actualDurationSeconds?: number | null;
  contentHash: string | null;
}

const SIZE_DIMS: Readonly<Record<string, { width: number; height: number }>> = {
  "1024x1024": { width: 1024, height: 1024 },
  "1536x1024": { width: 1536, height: 1024 },
  "1024x1536": { width: 1024, height: 1536 },
};

/** Deterministic technical tools over measured bytes and metadata. */
export function runTechnicalTools(input: TechnicalInput): ToolResult[] {
  const results: ToolResult[] = [];
  results.push({
    tool: "container-ok", version: RUBRIC_TOOL_VERSIONS["container-ok"],
    outcome: input.contentHash ? "pass" : "fail",
    detail: input.contentHash ? "validated container with content hash" : "no validated container or hash",
  });
  if (input.requestedSize && SIZE_DIMS[input.requestedSize]) {
    const expected = SIZE_DIMS[input.requestedSize] as { width: number; height: number };
    const match = input.actualWidth === expected.width && input.actualHeight === expected.height;
    results.push({
      tool: "dims-match", version: RUBRIC_TOOL_VERSIONS["dims-match"],
      outcome: input.actualWidth === null ? "unknown" : match ? "pass" : "fail",
      detail: input.actualWidth === null
        ? "actual dimensions unknown"
        : `requested ${input.requestedSize}, actual ${input.actualWidth}x${input.actualHeight}`,
    });
  } else {
    results.push({
      tool: "dims-match", version: RUBRIC_TOOL_VERSIONS["dims-match"],
      outcome: "unknown", detail: "no requested size recorded for this output",
    });
  }
  results.push({
    tool: "hash-present", version: RUBRIC_TOOL_VERSIONS["hash-present"],
    outcome: input.contentHash && /^[0-9a-f]{64}$/i.test(input.contentHash) ? "pass" : "fail",
    detail: input.contentHash ? "sha256 content hash present" : "content hash missing",
  });
  return results;
}

export interface LockedAttribute {
  entityKind: string;
  entityId: string;
  entityRevision: number;
  payloadHash: string;
  currentDigest: string | null;
}

/** Lock preservation: every locked attribute must still match its locked digest. */
export function runPreservationTools(locks: readonly LockedAttribute[]): ToolResult[] {
  if (locks.length === 0) {
    return [{ tool: "lock-intact", version: RUBRIC_TOOL_VERSIONS["lock-intact"], outcome: "unknown", detail: "no locked attributes to verify" }];
  }
  const broken = locks.filter((lock) => lock.currentDigest === null || lock.currentDigest !== lock.payloadHash);
  return [{
    tool: "lock-intact",
    version: RUBRIC_TOOL_VERSIONS["lock-intact"],
    outcome: broken.length === 0 ? "pass" : "fail",
    detail: broken.length === 0
      ? `${locks.length} locked attributes intact`
      : `${broken.length} locked attributes changed since lock`,
  }];
}
