// Shared shell.run executor tests
// Run with: npx tsx lib/tools/__tests__/executor-shell.test.ts

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeTool } from "../executor";
import type { ShellRunResult } from "../executor";

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

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ethen-shell-run-"));

  try {
    await writeFile(
      path.join(tempRoot, "package.json"),
      JSON.stringify(
        {
          name: "executor-shell-test",
          private: true,
          scripts: {
            test: "node -e \"console.log('sk-abc123def456ghijklmnopqrstuvwxyz0123456789')\"",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const blocked = await executeTool(tempRoot, {
      tool: "shell.run",
      command: "rm -rf .",
    });
    assert(!blocked.ok, "destructive shell command should be blocked");
    assert(
      !blocked.ok && blocked.error.includes("not in the shell.run allowlist"),
      "blocked shell command should fail before execution",
    );

    const operatorBlocked = await executeTool(tempRoot, {
      tool: "shell.run",
      command: "pnpm test && git status",
    });
    assert(!operatorBlocked.ok, "shell operators should be blocked");

    const allowed = await executeTool(tempRoot, {
      tool: "shell.run",
      command: "pnpm test",
    });
    assert(allowed.ok, "allowlisted command should execute");
    if (allowed.ok) {
      const shellRun = allowed.data as ShellRunResult;
      assertEqual(shellRun.command, "pnpm test", "result includes executed command");
      assertEqual(shellRun.cwd, tempRoot, "executor locks cwd to repo root");
      assertEqual(shellRun.exitCode, 0, "allowlisted command exits successfully");
      assert(
        !shellRun.stdout.includes("sk-abc123def456ghijklmnopqrstuvwxyz0123456789"),
        "stdout should be redacted on shared shell.run path",
      );
      assert(
        shellRun.stdout.includes("[REDACTED"),
        "stdout should include redaction placeholder",
      );
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
