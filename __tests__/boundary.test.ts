/**
 * Studio V2 Job 10 — standalone boundary tests (standalone-repo edition).
 * Run with: pnpm test:boundary
 * (node --conditions=react-server --import tsx __tests__/boundary.test.ts)
 *
 * Static + behavioral guards for the extraction (no network, no DB):
 * package identity, unique dev port, no app-to-app implementation imports,
 * no outside-repo imports/symlinks, legacy absence (write-block by structure),
 * test authority repointed, single-execution duplicate suppression, receipt
 * determinism, and preservation-module smoke (cinema/campaign/canvas entry points).
 *
 * Sections 5-7 are behaviorally identical to the monorepo edition; sections
 * 1-4 are repointed at standalone-repo structure (repo root == studio root).
 */
import { readFileSync, readdirSync, existsSync, statSync, lstatSync, readlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DurableJobService } from "@ethen/ai/platform/jobs/service";
import { InMemoryJobRepository } from "@ethen/ai/platform/jobs/in-memory-repository";
import { rankRoutes } from "../lib/media/routing";
import { validateWorkflowDefinition } from "../lib/media/canvas-workflow";
import { qualifyVideoCapability } from "../lib/media/video-capability";
import { requireCampaignBeta } from "../lib/media/campaign";
import { transitionCinemaStatus } from "../lib/media/cinema";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUDIO = resolve(HERE, "..");

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

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mjs|cjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// ── 1. package identity ──

function testPackageIdentity(): void {
  const manifest = JSON.parse(readFileSync(join(STUDIO, "package.json"), "utf8")) as Record<string, unknown>;
  assert(manifest.name === "@ethen/studio", "package identity is @ethen/studio");
  assert(manifest.private === true, "package is private");
  const scripts = (manifest.scripts ?? {}) as Record<string, string>;
  for (const script of ["dev", "typecheck", "build", "start", "test"]) {
    assert(typeof scripts[script] === "string" && scripts[script].length > 0, `script ${script} exists`);
  }
  assert((scripts.dev ?? "").includes("3015"), "dev port is 3015");
  const deps = (manifest.dependencies ?? {}) as Record<string, string>;
  // Decoupling fix: every @ethen/* specifier Studio imports is declared.
  for (const dep of ["@ethen/ai", "@ethen/tools", "@ethen/models"]) {
    assert(typeof deps[dep] === "string" && deps[dep].length > 0, `dependency ${dep} declared`);
  }
  for (const [name, version] of Object.entries(deps)) {
    if (name.startsWith("@ethen/")) {
      assert(version === "workspace:*", `${name} is workspace-pinned (${version})`);
    }
  }
  assert(!("@vercel/sandbox" in deps), "unused @vercel/sandbox dependency removed");
}

// ── 2. no app-to-app implementation imports + no outside-repo coupling ──

const FORBIDDEN_SPECIFIERS = [
  "apps/creative/",
  "apps/chat-core/",
  "apps/chat/",
  "apps/platform-core/",
  "apps/platform/",
  "apps/designer/",
  "apps/code/",
  "apps/computer/",
  "apps/voice/",
  "apps/founder/",
  "apps/desktop/",
  "apps/auth-api/",
  "apps/infrastructure/",
  "apps/local-runtime/",
  "apps/missions-core/",
  "apps/web/",
];

function testNoAppToAppImports(): void {
  const files = walk(STUDIO).filter((file) => !file.endsWith("__tests__/boundary.test.ts"));
  let violations = 0;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    // Import-level scan (comments may document sibling architecture).
    for (const match of content.matchAll(/(?:from\s*["']|import\s*\(\s*["'])([^"']+)["']/g)) {
      const specifier = match[1] as string;
      if (!specifier) continue;
      for (const forbidden of FORBIDDEN_SPECIFIERS) {
        if (specifier.includes(forbidden)) {
          violations += 1;
          console.error(`  FAIL: ${file.replace(`${STUDIO}/`, "")} imports ${specifier}`);
        }
      }
      if (specifier.startsWith("/Users/") || specifier.startsWith("/home/")) {
        violations += 1;
        console.error(`  FAIL: ${file.replace(`${STUDIO}/`, "")} uses absolute import ${specifier}`);
      }
      // Monorepo-shaped relative imports into packages must be bare @ethen/*.
      if (/^\.\.\/.*packages\//.test(specifier)) {
        violations += 1;
        console.error(`  FAIL: ${file.replace(`${STUDIO}/`, "")} uses monorepo-relative ${specifier}`);
      }
      // Relative imports must stay inside the repo.
      if (specifier.startsWith(".")) {
        const resolved = resolve(dirname(file), specifier);
        if (resolved !== STUDIO && !resolved.startsWith(`${STUDIO}/`)) {
          violations += 1;
          console.error(`  FAIL: ${file.replace(`${STUDIO}/`, "")} escapes to ${resolved}`);
        }
      }
    }
  }
  assert(violations === 0, "no app-to-app implementation imports and no outside-repo imports");
  assert(files.length > 100, `scanned a real surface (${files.length} files)`);
}

function testNoOutsideSymlinks(): void {
  const links: string[] = [];
  const scan = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        const target = resolve(dirname(full), readlinkSync(full));
        if (target !== STUDIO && !target.startsWith(`${STUDIO}/`)) links.push(full);
      } else if (stat.isDirectory()) {
        scan(full);
      }
    }
  };
  scan(STUDIO);
  for (const link of links) console.error(`  FAIL: outside-repo symlink ${link.replace(`${STUDIO}/`, "")}`);
  assert(links.length === 0, "no outside-repo symlinks");
}

// ── 3. legacy absence: write-block by structure ──

function testLegacyAbsence(): void {
  const gone = [
    "apps",
    "app/api/media",
  ];
  for (const dir of gone) {
    assert(!existsSync(join(STUDIO, dir)), `legacy authority retired: ${dir} absent`);
  }
  assert(existsSync(join(STUDIO, "app/studio")), "canonical studio surface present");
  assert(existsSync(join(STUDIO, "app/api/studio")), "canonical studio API present");
}

// ── 4. test authority repointed ──

function testAuthorityRepointed(): void {
  const manifest = JSON.parse(readFileSync(join(STUDIO, "package.json"), "utf8")) as { scripts: Record<string, string> };
  for (const [name, command] of Object.entries(manifest.scripts)) {
    assert(!command.includes("apps/studio"), `${name} no longer points at the monorepo path`);
  }
  assert(existsSync(join(STUDIO, "vitest.config.ts")), "standalone vitest config present");
  assert(existsSync(join(STUDIO, "scripts/run-studio-tests.mjs")), "standalone test runner present");
}

// ── 5. single execution: duplicate commands, one job ──

async function testSingleExecution(): Promise<void> {
  const service = new DurableJobService({ repository: new InMemoryJobRepository() });
  const input = {
    organizationId: "org-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "boundary-dup-key",
    payload: { kind: "openai-image", prompt: "boundary probe", actorId: "a", reservationKey: "boundary-dup-key", quotedCredits: 6, pricingVersionId: "p" },
  };
  const first = await service.createJob(input);
  const second = await service.createJob(input);
  assert(first.id === second.id, "duplicate logical operation yields one durable job");
}

// ── 6. receipt determinism ──

function testReceiptDeterminism(): void {
  const quotes = { "openai/gpt-image-1": { credits: 6, pricingVersionId: "a" } };
  const first = rankRoutes({ capability: "text-to-image", quotes, health: {} });
  const second = rankRoutes({ capability: "text-to-image", quotes, health: {} });
  assert(first.receipt.inputsHash === second.receipt.inputsHash, "receipts reproduce from inputs");
  assert(first.winner === "openai/gpt-image-1", "qualified route wins");
}

// ── 7. preservation-module smoke ──

function testPreservationSmoke(): void {
  validateWorkflowDefinition({
    nodes: [{ id: "a", op: "brief.create", inputs: [], params: { title: "t" } }],
    edges: [],
  });
  assert(true, "canvas DAG validation loads");
  let threw = false;
  try {
    qualifyVideoCapability("text-to-video");
  } catch {
    threw = true;
  }
  assert(threw, "T2V stays disabled");
  threw = false;
  try {
    requireCampaignBeta({} as NodeJS.ProcessEnv);
  } catch {
    threw = true;
  }
  assert(threw, "campaign gate closed without flag");
  transitionCinemaStatus("draft", "staged");
  assert(true, "cinema transitions load");
}

async function main(): Promise<void> {
  testPackageIdentity();
  testNoAppToAppImports();
  testNoOutsideSymlinks();
  testLegacyAbsence();
  testAuthorityRepointed();
  await testSingleExecution();
  testReceiptDeterminism();
  testPreservationSmoke();
  console.log(`studio boundary tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
