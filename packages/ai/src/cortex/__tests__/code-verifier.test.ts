// Cortex Code Verifier — unit tests
// Run with: npx tsx lib/cortex/__tests__/code-verifier.test.ts

import { verifyCodeOutput } from "../code-verifier";
import type { CodeVerifierContext } from "../code-verifier";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertIncludes(arr: string[], value: string, label: string): void {
  if (arr.includes(value)) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — expected array to include "${value}", got [${arr.join(", ")}]`);
}

function assertAny(arr: string[], predicate: (s: string) => boolean, label: string): void {
  if (arr.some(predicate)) { passed += 1; return; }
  failed += 1; console.error(`  FAIL: ${label} — no matching warning found in [${arr.join(", ")}]`);
}

function makeCtx(overrides?: Partial<CodeVerifierContext>): CodeVerifierContext {
  return {
    repoAvailable: true,
    repoName: "test-repo",
    repoBranch: "main",
    repoInspected: true,
    filesListed: ["src/index.ts", "src/utils.ts", "README.md"],
    filesRead: ["src/index.ts"],
    validationCommandsIdentified: true,
    validationCommands: ["pnpm lint", "pnpm typecheck"],
    writeActionsProposed: false,
    outputText: "Based on inspection of src/index.ts and src/utils.ts, the code structure is sound.",
    userRequest: "Review my project code",
    ...overrides,
  };
}

// ── 1. Repo-grounded code analysis → passed ────────────────────────────

{
  const result = verifyCodeOutput(makeCtx());
  assertEqual(result.status, "passed", "repo-grounded code → passed");
  assert(result.score >= 0.8, "repo-grounded code → score >= 0.8");
  assertEqual(result.verifierType, "code", "repo-grounded code → code verifier type");
  assert(result.repoGrounded, "repo-grounded code → repoGrounded true");
  assert(result.toolsUsed, "repo-grounded code → toolsUsed true");
  assert(result.validationPlanned, "repo-grounded code → validationPlanned true");
  assert(result.findings.some((f) => f.type === "repo_inspected"), "repo-grounded → repo_inspected finding");
  assert(result.findings.some((f) => f.type === "validation_planned"), "repo-grounded → validation_planned finding");
}

// ── 2. Repo not available → warned ─────────────────────────────────────

{
  const result = verifyCodeOutput(makeCtx({
    repoAvailable: false,
    repoInspected: false,
    filesListed: [],
    validationCommandsIdentified: false,
    validationCommands: [],
  }));
  assert(result.status === "warned" || result.status === "failed", "repo not available → warned or failed");
  assert(result.findings.some((f) => f.type === "repo_not_available"), "repo not available → repo_not_available finding");
  assert(!result.repoGrounded, "repo not available → repoGrounded false");
  assertAny(result.warnings, (w) => w.includes("ETHEN_LOCAL_REPO_PATH"), "repo not available → mentions env var");
}

// ── 3. Repo connected but not inspected → warned ───────────────────────

{
  const result = verifyCodeOutput(makeCtx({
    repoAvailable: true,
    repoInspected: false,
    filesListed: [],
    filesRead: [],
  }));
  assert(result.findings.some((f) => f.type === "repo_not_inspected"), "repo not inspected → repo_not_inspected finding");
  assertAny(result.warnings, (w) => w.includes("without repo inspection"), "repo not inspected → warning");
  assert(result.score < 1, "repo not inspected → score penalized");
}

// ── 4. Output references invented paths → risk flagged ─────────────────

{
  const result = verifyCodeOutput(makeCtx({
    filesListed: ["src/index.ts"],
    outputText: "Check src/auth/login.ts, src/auth/middleware.ts, src/db/schema.ts, and src/api/routes.ts.",
    userRequest: "Check auth flow",
  }));
  assert(result.findings.some((f) => f.type === "invented_path_risk"), "invented paths → invented_path_risk finding");
  assert(!result.repoGrounded, "invented paths → repoGrounded false");
}

// ── 5. No validation commands identified → warned ──────────────────────

{
  const result = verifyCodeOutput(makeCtx({
    validationCommandsIdentified: false,
    validationCommands: [],
    outputText: "The code looks fine. No issues found.",
  }));
  assert(result.findings.some((f) => f.type === "no_validation_planned"), "no validation → no_validation_planned finding");
  assert(!result.validationPlanned, "no validation → validationPlanned false");
  assertAny(result.warnings, (w) => w.includes("lint"), "no validation → mentions lint");
}

// ── 6. Write actions proposed → approval flagged ───────────────────────

{
  const result = verifyCodeOutput(makeCtx({
    writeActionsProposed: false,
    outputText: "You should create file src/auth.ts and edit src/index.ts to add the import. Run pnpm install to add the dependency.",
  }));
  assert(result.findings.some((f) => f.type === "write_action_proposed"), "write proposed → write_action_proposed finding");
  assertAny(result.warnings, (w) => w.includes("approval"), "write proposed → approval warning");
}

// ── 7. Output with validation commands inline → validation planned ──────

{
  const result = verifyCodeOutput(makeCtx({
    validationCommandsIdentified: false,
    validationCommands: [],
    outputText: "After making these changes, run `pnpm lint` and `pnpm typecheck` to verify. Then execute `pnpm test` to run the test suite.",
  }));
  assert(result.validationPlanned, "inline commands → validationPlanned true");
}

// ── 8. Empty output → failed ────────────────────────────────────────────

{
  const result = verifyCodeOutput(makeCtx({
    outputText: "",
    repoInspected: false,
    filesListed: [],
  }));
  assertEqual(result.status, "failed", "empty output → failed");
  assertEqual(result.score, 0, "empty output → score 0");
  assert(!result.repoGrounded, "empty output → repoGrounded false");
  assert(result.requiresRerun, "empty output → requiresRerun true");
}

// ── 9. No exported network/provider imports needed ──────────────────────

{
  assert(
    typeof verifyCodeOutput === "function",
    "code verifier exports a function (no provider/network imports required)"
  );
  const result = verifyCodeOutput(makeCtx());
  assert(
    result.status !== undefined && result.score !== undefined,
    "code verifier returns structured output without network calls"
  );
}

// ── 10. Full success scenario → all flags correct ──────────────────────

{
  const result = verifyCodeOutput(makeCtx({
    filesListed: ["src/app.ts", "src/routes.ts", "src/types.ts", "src/utils.ts"],
    filesRead: ["src/app.ts", "src/routes.ts"],
    validationCommandsIdentified: true,
    validationCommands: ["pnpm lint", "pnpm typecheck", "pnpm build", "pnpm test"],
    writeActionsProposed: false,
    outputText: "After inspecting src/app.ts and src/routes.ts, the architecture is clean. Run pnpm lint && pnpm typecheck && pnpm build && pnpm test to validate.",
  }));
  assertEqual(result.status, "passed", "full success → passed");
  assert(result.repoGrounded, "full success → repoGrounded true");
  assert(result.validationPlanned, "full success → validationPlanned true");
  assert(result.toolsUsed, "full success → toolsUsed true");
  assert(result.score >= 0.9, "full success → score >= 0.9");
}

// ── 11. Debounced write action not over-flagged ─────────────────────────

{
  const result = verifyCodeOutput(makeCtx({
    writeActionsProposed: false,
    outputText: "No changes needed. The existing code structure is well-organized.",
  }));
  assert(!result.findings.some((f) => f.type === "write_action_proposed"), "no changes → no write_action_proposed finding");
}

// ── Summary ─────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
