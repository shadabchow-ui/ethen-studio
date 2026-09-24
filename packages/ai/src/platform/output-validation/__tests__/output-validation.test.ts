// Output Validation — Validation Suite
// Run with: npx tsx lib/platform/output-validation/__tests__/output-validation.test.ts

import { validateOutput } from "../index";
import type { ValidationSchema } from "../types";

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
  console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const payloadSchema: ValidationSchema = {
  type: "object",
  required: ["title", "content"],
  properties: {
    title: { type: "string", minLength: 1 },
    content: { type: "string", minLength: 1 },
    metadata: { type: "object" },
  },
};

console.log("\nSchema and JSON safety");
{
  const result = validateOutput(
    {
      title: "Valid",
      content: "A".repeat(5005),
      metadata: {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        nested: { value: 1, skip: undefined },
      },
    },
    { schema: payloadSchema, schemaName: "artifact-payload", maxStringLength: 120 },
  );

  assert(result.ok, "schema-safe payload should remain ok");
  assertEqual(result.severity, "warning", "truncation should surface warning severity");
  assert(typeof (result.sanitizedOutput as { content: string }).content === "string", "content should remain a string");
  assert((result.sanitizedOutput as { content: string }).content.length === 120, "content should be truncated to max length");
  assert(result.evidence.truncatedPaths.includes("$.content"), "truncated path should be tracked");
}

console.log("Schema mismatch");
{
  const result = validateOutput(
    {
      title: "Missing body",
    },
    { schema: payloadSchema, schemaName: "artifact-payload" },
  );

  assert(!result.ok, "missing required field should fail validation");
  assert(result.errors.some((issue) => issue.code === "schema_required_missing"), "missing required field should produce schema error");
}

console.log("Secret redaction");
{
  const result = validateOutput(
    {
      title: "Secrets",
      content: "API_KEY=" + "sk-abc123def456ghijklmnopqrstuvwxyz0123456789",
    },
    { schema: payloadSchema, schemaName: "artifact-payload" },
  );

  assert(result.ok, "redaction should not fail validation");
  assert(result.redactions.length > 0, "redactions should be recorded");
  assert(!(result.sanitizedOutput as { content: string }).content.includes("sk-abc123"), "sanitized output should not leak raw secret");
}

console.log("Executable content detection");
{
  const warningResult = validateOutput(
    {
      title: "Script sample",
      content: "<script>alert('x')</script>",
    },
    { schema: payloadSchema, schemaName: "artifact-payload", executableContentMode: "warn" },
  );

  assert(warningResult.ok, "warn mode should not fail validation");
  assert(warningResult.warnings.some((issue) => issue.code === "executable_content_detected"), "warn mode should produce warning");

  const blockingResult = validateOutput(
    {
      title: "Dangerous script",
      content: "<script>alert('x')</script>",
    },
    { schema: payloadSchema, schemaName: "artifact-payload", executableContentMode: "block" },
  );

  assert(!blockingResult.ok, "block mode should fail validation");
  assert(blockingResult.errors.some((issue) => issue.code === "executable_content_detected"), "block mode should produce error");
}

console.log("Grounding checks");
{
  const result = validateOutput(
    {
      title: "Grounded report",
      content: "Summary without citations",
    },
    { schema: payloadSchema, schemaName: "artifact-payload", requireGrounding: true, citationCount: 0 },
  );

  assert(result.ok, "missing citations should warn, not fail");
  assert(result.warnings.some((issue) => issue.code === "missing_citations"), "grounding stage should warn when citations are required");
  assertEqual(result.evidence.grounded, true, "grounded flag should be tracked");
}

console.log(`\nOutput validation results: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
  process.exit(1);
}
