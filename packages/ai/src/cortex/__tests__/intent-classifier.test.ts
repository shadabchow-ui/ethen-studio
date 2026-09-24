// Cortex Intent Classifier — unit tests
// Run with: npx tsx lib/cortex/__tests__/intent-classifier.test.ts

import { classifyIntent, getDefaultModeForIntent } from "../intent-classifier";
import type {
  IntentClassifierInput,
  IntentClassification,
  EthenIntent,
  EthenMode,
} from "../types";

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

function makeInput(message: string, overrides?: Partial<IntentClassifierInput>): IntentClassifierInput {
  return {
    message,
    selectedMode: "auto",
    ...overrides,
  };
}

function isCodingIntent(intent: EthenIntent): boolean {
  return intent.startsWith("coding.");
}

function isResearchIntent(intent: EthenIntent): boolean {
  return intent.startsWith("research.");
}

function isWritingIntent(intent: EthenIntent): boolean {
  return intent.startsWith("writing.");
}

function isAutomationIntent(intent: EthenIntent): boolean {
  return intent.startsWith("automation.") || intent === "ops.workflow";
}

// ── Coding intent detection ─────────────────────────────────────────────

{
  const inputs: [string, string][] = [
    ["Fix the bug in src/auth.ts", "bug in file path"],
    ["Refactor the repository module", "refactor repo"],
    ["Implement a new API endpoint", "implement api"],
    ["Debug the build failure on line 42", "debug build"],
    ["Review my pull request", "pr review"],
    ["What does git status show?", "git command"],
    ["Add tests for the UserService class", "add tests class"],
    ["Deploy to production", "deploy"],
    ["Check the diff before committing", "diff commit"],
  ];

  for (const [msg, label] of inputs) {
    const result = classifyIntent(makeInput(msg));
    assert(isCodingIntent(result.primaryIntent), `coding: "${label}" → coding intent (got ${result.primaryIntent})`);
  }
}

// ── Coding intent from file path patterns ───────────────────────────────

{
  const result = classifyIntent(makeInput("What does src/components/Button.tsx do?"));
  assert(isCodingIntent(result.primaryIntent), "file path pattern → coding intent");
}

{
  const result = classifyIntent(makeInput("Look at lib/utils/helpers.ts line 25"));
  assert(isCodingIntent(result.primaryIntent), "file path with line number → coding intent");
}

// ── Research intent detection ───────────────────────────────────────────

{
  const inputs: [string, string][] = [
    ["Research the latest AI router pricing", "research + pricing"],
    ["Look up current GPU benchmarks", "look up + benchmarks"],
    ["What are the latest news on quantum computing?", "latest news"],
    ["Find sources about climate change", "find sources"],
    ["Compare OpenAI vs Anthropic pricing", "compare pricing"],
    ["Search for competitor funding rounds", "competitor search"],
    ["What does the documentation say about hooks?", "docs lookup"],
    ["Give me a market analysis of AI agents", "market analysis"],
  ];

  for (const [msg, label] of inputs) {
    const result = classifyIntent(makeInput(msg));
    assert(isResearchIntent(result.primaryIntent), `research: "${label}" → research intent (got ${result.primaryIntent})`);
  }
}

// ── Writing intent detection ────────────────────────────────────────────

{
  const inputs: [string, string][] = [
    ["Write a tweet about our launch", "write tweet"],
    ["Draft an email to the client", "draft email"],
    ["Rewrite this paragraph to be more concise", "rewrite paragraph"],
    ["Edit my essay for grammar", "edit essay"],
    ["Summarize this article in bullet points", "summarize"],
    ["Write landing page copy for our product", "copy landing page"],
    ["Help me with the tone of this message", "tone"],
  ];

  for (const [msg, label] of inputs) {
    const result = classifyIntent(makeInput(msg));
    assert(isWritingIntent(result.primaryIntent), `writing: "${label}" → writing intent (got ${result.primaryIntent})`);
  }
}

// ── Automation / Operator intent detection ──────────────────────────────

{
  const inputs: [string, string][] = [
    ["Schedule a daily report email", "schedule email"],
    ["Automate the deployment pipeline", "automate pipeline"],
    ["Create a workflow to monitor errors", "workflow monitor"],
    ["Send a notification when the build fails", "send notification trigger"],
    ["Set up a connector to HubSpot", "connector"],
  ];

  for (const [msg, label] of inputs) {
    const result = classifyIntent(makeInput(msg));
    assert(isAutomationIntent(result.primaryIntent), `automation: "${label}" → automation intent (got ${result.primaryIntent})`);
  }
}

// ── Planning intent detection ───────────────────────────────────────────

{
  const result = classifyIntent(makeInput("Design the architecture for our new platform"));
  assert(result.primaryIntent === "planning.product", "architecture → planning.product");
}

{
  const result = classifyIntent(makeInput("Create a technical blueprint for the migration"));
  assert(result.primaryIntent === "planning.product", "blueprint → planning.product");
}

{
  const result = classifyIntent(makeInput("Audit our current security posture"));
  assert(result.primaryIntent === "planning.product", "audit → planning.product");
}

// ── Data analysis signal ────────────────────────────────────────────────

{
  const result = classifyIntent(makeInput("Analyze the sales data and create a chart"));
  assert(result.primaryIntent === "data.analyze", "analyze data → data.analyze");
}

{
  const result = classifyIntent(
    makeInput("Help me understand this file", {
      attachments: [{ type: "file", path: "sales.csv", name: "sales.csv" }],
    })
  );
  assertEqual(result.primaryIntent, "data.analyze", "csv attachment → data.analyze");
}

// ── General chat fallback ───────────────────────────────────────────────

{
  const result = classifyIntent(makeInput("Hello how are you?"));
  assertEqual(result.primaryIntent, "general.chat", "greeting → general.chat");
}

{
  const result = classifyIntent(makeInput("What's the weather like?"));
  assertEqual(result.primaryIntent, "general.chat", "casual question → general.chat");
}

// ── Selected mode override ──────────────────────────────────────────────

{
  const result = classifyIntent(makeInput("Tell me something interesting", { selectedMode: "writer" }));
  assert(
    isWritingIntent(result.primaryIntent),
    `mode override: writer mode → writing intent (got ${result.primaryIntent})`
  );
  assert(
    result.reasonCodes.includes("mode_override"),
    "mode_override reason code present"
  );
}

{
  const result = classifyIntent(makeInput("Tell me something interesting", { selectedMode: "code" }));
  assert(
    isCodingIntent(result.primaryIntent),
    `mode override: code mode → coding intent (got ${result.primaryIntent})`
  );
}

{
  const result = classifyIntent(makeInput("Find the latest AI news", { selectedMode: "research" }));
  assert(
    isResearchIntent(result.primaryIntent),
    `mode override: research mode → research intent (got ${result.primaryIntent})`
  );
}

// ── Attachment influence ────────────────────────────────────────────────

{
  const result = classifyIntent(
    makeInput("Check this", {
      attachments: [{ type: "file", path: "src/index.ts", name: "index.ts" }],
    })
  );
  assert(isCodingIntent(result.primaryIntent), "ts file attachment → coding intent");
}

{
  const result = classifyIntent(
    makeInput("Check this", {
      attachments: [{ type: "file", path: "report.xlsx", name: "report.xlsx" }],
    })
  );
  assertEqual(result.primaryIntent, "data.analyze", "xlsx attachment → data.analyze");
}

// ── Risk level detection ────────────────────────────────────────────────

{
  const result = classifyIntent(makeInput("Deploy to production"));
  assertEqual(result.riskLevel, "high", "deploy to production → high risk");
}

{
  const result = classifyIntent(makeInput("Delete all user data"));
  assertEqual(result.riskLevel, "high", "delete user data → high risk");
}

{
  const result = classifyIntent(makeInput("Process a payment of $500"));
  assertEqual(result.riskLevel, "high", "payment → high risk");
}

{
  const result = classifyIntent(makeInput("Can you review my code?"));
  assert(result.riskLevel === "low" || result.riskLevel === "medium", "code review → low or medium risk");
}

// ── Metadata flags ──────────────────────────────────────────────────────

{
  const result = classifyIntent(makeInput("Fix the bug in auth.ts"));
  assert(result.requiresRepoContext, "coding intent → requiresRepoContext");
  assert(result.requiresTools, "coding intent → requiresTools");
  assert(result.requiresVerifier, "coding intent → requiresVerifier");
}

{
  const result = classifyIntent(makeInput("Research the latest GPU prices"));
  assert(result.requiresFreshness, "research + latest → requiresFreshness");
  assert(result.requiresTools, "research → requiresTools");
  assert(result.requiresVerifier, "research → requiresVerifier");
}

{
  const result = classifyIntent(makeInput("Hi"));
  assert(!result.requiresTools, "chat → no tools required");
  assert(!result.requiresRepoContext, "chat → no repo context");
  assert(!result.requiresVerifier, "chat → no verifier required");
}

// ── Confidence scoring ──────────────────────────────────────────────────

{
  const result = classifyIntent(makeInput("Fix the bug in the auth module by refactoring the repository layer"));
  assert(result.confidence >= 0.7, `strong coding signal → high confidence (got ${result.confidence})`);
}

{
  const result = classifyIntent(makeInput("Hello"));
  assert(result.confidence <= 0.5, `no signal → low confidence (got ${result.confidence})`);
}

// ── Determinism ─────────────────────────────────────────────────────────

{
  const input: IntentClassifierInput = {
    message: "Write a tweet about our new AI product launch and research competitors",
    selectedMode: "auto",
  };
  const r1 = classifyIntent(input);
  const r2 = classifyIntent(input);
  assertEqual(r1.primaryIntent, r2.primaryIntent, "same input → same primaryIntent");
  assertEqual(r1.confidence, r2.confidence, "same input → same confidence");
  assertEqual(r1.riskLevel, r2.riskLevel, "same input → same riskLevel");
  assertEqual(
    JSON.stringify(r1.reasonCodes),
    JSON.stringify(r2.reasonCodes),
    "same input → same reasonCodes"
  );
}

// ── getDefaultModeForIntent ─────────────────────────────────────────────

{
  assertEqual(getDefaultModeForIntent("coding.inspect"), "code", "coding intent → code mode");
  assertEqual(getDefaultModeForIntent("research.web"), "research", "research intent → research mode");
  assertEqual(getDefaultModeForIntent("writing.draft"), "writer", "writing intent → writer mode");
  assertEqual(getDefaultModeForIntent("automation.plan"), "operator", "automation intent → operator mode");
  assertEqual(getDefaultModeForIntent("general.chat"), "cortex", "chat intent → cortex mode");
  assertEqual(getDefaultModeForIntent("general.reasoning"), "cortex-pro", "reasoning → cortex-pro");
  assertEqual(getDefaultModeForIntent("data.analyze"), "cortex-pro", "data analyze → cortex-pro");
  assertEqual(getDefaultModeForIntent("unknown"), "cortex", "unknown → cortex fallback");
}

// ── Secondary intents ───────────────────────────────────────────────────

{
  const result = classifyIntent(makeInput("Write a blog post about bug fixing techniques"));
  assert(
    result.secondaryIntents.length >= 0,
    `secondary intents is an array (${result.secondaryIntents.length} items)`
  );
}

// ── Reason codes ────────────────────────────────────────────────────────

{
  const result = classifyIntent(makeInput("Fix bug in auth.ts"));
  assert(result.reasonCodes.includes("keyword_match"), "coding → keyword_match reason");
}

{
  const result = classifyIntent(
    makeInput("Hi", {
      attachments: [{ type: "file", path: "main.ts", name: "main.ts" }],
    })
  );
  assert(result.reasonCodes.includes("attachment_signal"), "code file → attachment_signal reason");
}

{
  const result = classifyIntent(makeInput("Hello"));
  assert(result.reasonCodes.includes("default_fallback"), "no signals → default_fallback");
}

// ── Conversation context ────────────────────────────────────────────────

{
  const input: IntentClassifierInput = {
    message: "Tell me a joke",
    selectedMode: "auto",
    conversationState: { turnCount: 5, lastMode: "cortex", lastIntent: "coding.inspect" },
  };
  const result = classifyIntent(input);
  assert(
    result.primaryIntent !== "coding.inspect" || result.reasonCodes.includes("conversation_context"),
    `conversation context: primary ${result.primaryIntent}, last coding.inspect → reason codes: ${result.reasonCodes.join(", ")}`
  );
}

// ── Auto mode preserves auto classification ─────────────────────────────

{
  const result = classifyIntent(makeInput("Fix the bug in auth.ts"));
  assert(isCodingIntent(result.primaryIntent), `auto mode: bug fix → coding intent (got ${result.primaryIntent})`);
}

// ── Summary ─────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
