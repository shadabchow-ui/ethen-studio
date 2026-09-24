// Safe Command Allowlist — Validation Suite
// Run with: npx tsx lib/local/__tests__/safe-command.test.ts

import {
  resolveAllowedCommand,
  isCommandAllowed,
  isKnownDenied,
  ALLOWED_COMMAND_STRINGS,
  executableForPlatform,
} from "../safe-command";

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

// ── Allowed commands resolve correctly ──────────────────────────────────────

const allowedCommands = [
  "pnpm lint",
  "pnpm typecheck",
  "pnpm build",
  "pnpm test",
  "git diff",
  "git status",
];

for (const cmd of allowedCommands) {
  assert(isCommandAllowed(cmd), `"${cmd}" should be allowed`);
}

assertEqual(resolveAllowedCommand("pnpm lint")?.executable, "pnpm", "pnpm lint → executable pnpm");
assertEqual(resolveAllowedCommand("pnpm lint")?.args[0], "lint", "pnpm lint → args[0] lint");
assertEqual(resolveAllowedCommand("pnpm typecheck")?.args[0], "typecheck", "pnpm typecheck → args[0] typecheck");
assertEqual(resolveAllowedCommand("pnpm build")?.args[0], "build", "pnpm build → args[0] build");
assertEqual(resolveAllowedCommand("pnpm test")?.args[0], "test", "pnpm test → args[0] test");
assertEqual(resolveAllowedCommand("git diff")?.executable, "git", "git diff → executable git");
assertEqual(resolveAllowedCommand("git diff")?.args[0], "diff", "git diff → args[0] diff");
assertEqual(resolveAllowedCommand("git status")?.executable, "git", "git status → executable git");
assertEqual(resolveAllowedCommand("git status")?.args[0], "status", "git status → args[0] status");
assertEqual(resolveAllowedCommand("git status")?.args[1], "--porcelain=v1", "git status → args[1] --porcelain=v1");

// ── Trimmed commands should work ────────────────────────────────────────────

assert(isCommandAllowed(" pnpm lint "), "Trimmed \" pnpm lint \" should be allowed");
assertEqual(resolveAllowedCommand(" pnpm lint ")?.executable, "pnpm", "Trimmed pnpm lint → executable pnpm");

// ── Denied commands are not allowed ─────────────────────────────────────────

const deniedCommands = [
  "npm install",
  "pnpm add",
  "pnpm install",
  "yarn add",
  "bun add",
  "pip install",
  "npx",
  "npx vitest",
  "curl",
  "wget",
  "rm",
  "rm -rf .",
  "mv",
  "chmod",
  "chown",
  "sudo",
  "git reset",
  "git checkout",
  "git clean",
  "git push",
  "git commit",
];

for (const cmd of deniedCommands) {
  assert(!isCommandAllowed(cmd), `"${cmd}" should NOT be allowed`);
  assert(resolveAllowedCommand(cmd) === null, `"${cmd}" should resolve to null`);
}

// ── Unknown commands not in allowlist ───────────────────────────────────────

assert(!isCommandAllowed("ls -la"), "Unknown command should not be allowed");
assert(!isCommandAllowed("echo hello"), "Unknown command should not be allowed");
assert(!isCommandAllowed("cat file.ts"), "Unknown command should not be allowed");
assert(!isCommandAllowed(""), "Empty command should not be allowed");

// ── isKnownDenied ──────────────────────────────────────────────────────────

assert(isKnownDenied("npm install"), "npm install is known denied");
assert(isKnownDenied("pnpm add some-package"), "pnpm add ... is known denied");
assert(isKnownDenied("pip install requests"), "pip install ... is known denied");
assert(isKnownDenied("git push origin main"), "git push ... is known denied");
assert(isKnownDenied("rm -rf node_modules"), "rm ... is known denied");
assert(isKnownDenied("curl https://example.com"), "curl ... is known denied");
assert(!isKnownDenied("pnpm lint"), "pnpm lint is NOT known denied");
assert(!isKnownDenied("git status"), "git status is NOT known denied");

// ── Injection patterns rejected ───────────────────────────────────────────────

assert(!isCommandAllowed("pnpm lint && echo hi"), "Injection: && blocked");
assert(!isCommandAllowed("pnpm lint; echo hi"), "Injection: ; blocked");
assert(!isCommandAllowed("pnpm lint || echo hi"), "Injection: || blocked");
assert(!isCommandAllowed("pnpm lint | grep error"), "Injection: | blocked");
assert(!isCommandAllowed("pnpm lint > out.txt"), "Injection: > blocked");
assert(!isCommandAllowed("echo $(whoami)"), "Injection: $() blocked");
assert(!isCommandAllowed("echo `whoami`"), "Injection: backticks blocked");

assertEqual(resolveAllowedCommand("pnpm lint && rm -rf /") , null, "Injection: resolve returns null for &&");
assertEqual(resolveAllowedCommand("pnpm lint; echo"), null, "Injection: resolve returns null for ;");

// ── Allowlist completeness ─────────────────────────────────────────────────

assertEqual(executableForPlatform("pnpm", "win32"), "pnpm.cmd", "Windows uses pnpm.cmd shim without a shell");
assertEqual(executableForPlatform("npm", "win32"), "npm.cmd", "Windows uses npm.cmd shim without a shell");
assertEqual(executableForPlatform("pnpm", "darwin"), "pnpm", "macOS keeps pnpm executable");
assertEqual(executableForPlatform("git", "win32"), "git", "Windows does not rewrite non-package executables");
assert(isCommandAllowed("npm run lint"), "npm validation command is allowed");
assert(isCommandAllowed("yarn test"), "yarn validation command is allowed");
assertEqual(ALLOWED_COMMAND_STRINGS.length, 14, "Exactly 14 fixed commands in allowlist");
for (const allowed of allowedCommands) {
  assert(ALLOWED_COMMAND_STRINGS.includes(allowed), `"${allowed}" must be in ALLOWED_COMMAND_STRINGS`);
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
