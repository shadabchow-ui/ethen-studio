#!/usr/bin/env node
/**
 * Standalone Studio test runner.
 *
 * Runs every Studio-owned suite with its own runner convention:
 *  - self-executing tsx suites (lib/media/__tests__, __tests__/boundary,
 *    __tests__/sidebar-collapsed-logo)
 *  - node:test suites (__tests__/studio-v5-presentation)
 *  - vitest suites (lib/media/__tests__/media-audit)
 *
 * The browser suite (__tests__/studio-scroll-regression) needs a live server
 * and is excluded by default; run it explicitly with STUDIO_BASE_URL set
 * (see docs/DEPLOYMENT.md).
 *
 * Modes:
 *  - default: exit 0 iff every suite passes.
 *  - --parity: compare per-file verdicts against tests/baseline.head.json
 *    (recorded from committed SOURCE_HEAD); exit 0 iff NEW failures == 0.
 *    Suites that failed at HEAD and still fail are reported, not gated.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PARITY = process.argv.includes("--parity");

const TSX_ENV = { ...process.env, NODE_OPTIONS: "--conditions=react-server" };
const PLAIN_ENV = { ...process.env };

function run(cmd, args, env, cwd = ROOT) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8" });
  return { status: r.status ?? 1, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
}

const suites = [];
for (const f of readdirSync(join(ROOT, "lib/media/__tests__")).filter((n) => n.endsWith(".test.ts")).sort()) {
  if (f === "media-audit.test.ts") continue; // vitest lane below
  suites.push({ file: `lib/media/__tests__/${f}`, kind: "tsx" });
}
suites.push({ file: "__tests__/boundary.test.ts", kind: "tsx" });
suites.push({ file: "__tests__/sidebar-collapsed-logo.test.ts", kind: "tsx-plain" });
suites.push({ file: "__tests__/studio-v5-presentation.test.ts", kind: "node-test" });
suites.push({ file: "lib/media/__tests__/media-audit.test.ts", kind: "vitest" });

const results = [];
for (const s of suites) {
  let r;
  if (s.kind === "tsx") r = run("node", ["--conditions=react-server", "--import", "tsx", s.file], TSX_ENV);
  else if (s.kind === "tsx-plain") r = run("node", ["--import", "tsx", s.file], PLAIN_ENV);
  else if (s.kind === "node-test") r = run("node", ["--import", "tsx", "--test", s.file], PLAIN_ENV);
  else r = run("node", ["--conditions=react-server", "./node_modules/vitest/vitest.mjs", "run", s.file], TSX_ENV);
  const pass = r.status === 0;
  results.push({ ...s, pass, tail: (pass ? r.stdout : `${r.stdout}\n${r.stderr}`).split("\n").slice(-6).join("\n") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${s.file} [${s.kind}]`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} studio suites passed`);
for (const r of results.filter((r) => !r.pass)) {
  console.log(`\n--- ${r.file} ---\n${r.tail}`);
}

if (!PARITY) {
  if (passed !== results.length) {
    console.log("\nTip: `pnpm test:parity` gates only NEW failures vs the HEAD baseline.");
    process.exitCode = 1;
  }
  process.exit();
}

// ── parity mode ──
const baselinePath = join(ROOT, "tests/baseline.head.json");
if (!existsSync(baselinePath)) {
  console.error("parity baseline missing: tests/baseline.head.json");
  process.exitCode = 2;
  process.exit();
}
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
let newFailures = 0;
let fixed = 0;
console.log("\nParity vs HEAD baseline:");
for (const r of results) {
  const base = baseline.results?.[r.file];
  if (base === undefined) {
    console.log(`  NEW-SUITE  ${r.file} -> ${r.pass ? "pass" : "FAIL"}`);
    if (!r.pass) newFailures += 1;
  } else if (base === "pass" && !r.pass) {
    console.log(`  REGRESSION ${r.file} (HEAD pass -> FAIL)`);
    newFailures += 1;
  } else if (base === "fail" && r.pass) {
    console.log(`  FIXED      ${r.file} (HEAD fail -> pass)`);
    fixed += 1;
  } else {
    console.log(`  SAME       ${r.file} (${base})`);
  }
}
console.log(`\nNEW_TEST_FAILURES=${newFailures} FIXED_SINCE_HEAD=${fixed}`);
if (newFailures > 0) process.exitCode = 1;
