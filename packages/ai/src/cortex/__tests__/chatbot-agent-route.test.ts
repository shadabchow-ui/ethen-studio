// Chatbot agent live route — Cortex wiring tests
// Run with: NODE_OPTIONS=--conditions=react-server npx tsx lib/cortex/__tests__/chatbot-agent-route.test.ts

import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { traceDataFromHeaders } from "../trace-data";
import { CHATBOT_AGENT_CHAT_ENDPOINT } from "../route-endpoints";
import { createChatbotAgentResponse } from "../chatbot-agent-route";
import type { Agent } from "@ethen/contracts/agents/types";
import type { EthenRouteReceipt, IntentClassification } from "../types";
import type { GatewayProviderRoute, GatewayResult } from "@ethen/models/gateway/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${label}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    passed += 1;
    console.log(`  PASS: ${label}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/chatbot-agent/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createTextStream(chunks: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function readResponseBody(response: Response): Promise<string> {
  return response.text();
}

function createGatewayRoute(overrides?: Partial<GatewayProviderRoute>): GatewayProviderRoute {
  return {
    routeId: "text-reasoning",
    profile: {
      routeId: "text-reasoning",
      capability: "reasoning",
      description: "Reasoning route",
      models: { openai: "o3-mini" },
    },
    providerId: "openai",
    fallbackProviderId: null,
    mode: "production",
    source: "env-default",
    selectedProvider: "OpenAI",
    selectedModelAlias: "o3-mini",
    attemptCount: 1,
    attempts: [
      { attemptNumber: 1, providerId: "openai", timestamp: "2026-06-22T00:00:00.000Z", succeeded: true },
    ],
    cortexSelection: {
      reasonCodes: ["selected_by_intent"],
      candidateCount: 2,
      selectedCandidateRank: 1,
      score: 0.92,
    },
    ...overrides,
  };
}

function createGatewayResult(): GatewayResult {
  return {
    textStream: createTextStream(["Hello", " world"]),
    usage: {
      inputMessages: 1,
      inputCharacters: 12,
      outputCharacters: 11,
      inputTokens: 5,
      outputTokens: 4,
      creditCost: 1,
    },
    route: createGatewayRoute(),
    warnings: [],
  };
}

function createReceipt(): EthenRouteReceipt {
  return {
    receiptVersion: "ethen.route_receipt.v1",
    requestId: "req-test",
    runId: "run-test",
    timestamp: "2026-06-22T00:00:00.000Z",
    mode: "research",
    intent: "research.technical",
    routeProfile: "research",
    routeClass: "tool_augmented",
    provider: {
      selectedProvider: "OpenAI",
      selectedModel: "o3-mini",
      providerVisible: true,
      modelVisible: true,
      isByok: false,
      regionClass: "default",
    },
    selection: {
      reasonCodes: ["selected_by_intent"],
      candidateCount: 2,
      selectedCandidateRank: 1,
      score: 0.92,
    },
    fallback: {
      attempted: false,
      used: false,
      attempts: [
        { attemptNumber: 1, providerId: "openai", timestamp: "2026-06-22T00:00:00.000Z", succeeded: true },
      ],
      finalStatus: "primary_success",
    },
    tools: {},
    verifier: {
      used: false,
      status: "skipped",
      warnings: ["Verifier skipped: output not available for verification."],
    },
    usage: {
      inputTokens: 5,
      outputTokens: 4,
      totalTokens: 9,
      estimatedCostUsd: 1,
      costEstimateStatus: "estimated",
      timeToFirstTokenMs: 180,
    },
    quality: {
      confidence: "high",
    },
    redactions: [],
  };
}

function createClassification(): IntentClassification {
  return {
    primaryIntent: "research.technical",
    secondaryIntents: [],
    confidence: 0.91,
    reasonCodes: ["keyword_match"],
    requiresFreshness: false,
    requiresTools: true,
    requiresRepoContext: false,
    requiresVerifier: false,
    riskLevel: "low",
  };
}

type CortexRequestParams = {
  sessionId?: string | null;
  messages: import("@ethen/models/gateway/types").GatewayChatMessage[];
  selectedMode?: string;
  agent?: { routeId?: string | null } | null;
};

async function testRouteUsesCortexAndStreamsSse(): Promise<void> {
  console.log("\n[Route — Cortex orchestration]");

  const calls: CortexRequestParams[] = [];
  const persisted: Array<Array<{ session_id: string; role: "user" | "assistant"; content: string }>> = [];

  const response = await createChatbotAgentResponse(
    createRequest({
      message: "Research the latest gateway routing approach",
      sessionId: "sess-live",
      agentSlug: "chatbot-agent",
      selectedMode: "research",
    }),
    {
      getAgentBySlugFn: (slug: string): Agent => ({
        id: "agent-1",
        slug,
        name: "Chatbot Agent",
        category: "general",
        description: "General chat agent",
        long_description: "General chat agent",
        icon: "chat",
        workspace_archetype: "generic_chat",
        status: "active",
        visibility: "public",
        is_featured: false,
        sort_order: 1,
        credit_cost: 3,
        example_prompts: [],
        route_id: "text-reasoning",
      }),
      hasSupabaseEnvFn: () => true,
      insertServerMessagesFn: async (messages) => {
        persisted.push(
          messages
            .filter(
              (message): message is { session_id: string; role: "user" | "assistant"; content: string } =>
                message.role === "user" || message.role === "assistant",
            )
            .map((message) => ({
              session_id: message.session_id,
              role: message.role,
              content: message.content,
            })),
        );
        return true;
      },
      runCortexChatFn: async (params: CortexRequestParams) => {
        calls.push(params);
        return {
          result: createGatewayResult(),
          receipt: createReceipt(),
          classification: createClassification(),
          effectiveMode: "research",
          cortexProfile: null,
        };
      },
    },
  );

  const body = await readResponseBody(response);
  const encodedReceipt = response.headers.get("X-Ethen-Cortex-Receipt");

  assertEqual(response.headers.get("content-type"), "text/event-stream", "response stays on SSE content type");
  assertEqual(response.headers.get("X-Ethen-Cortex-Mode"), "research", "Cortex mode header is returned");
  assertEqual(response.headers.get("X-Ethen-Cortex-Intent"), "research.technical", "Cortex intent header is returned");
  assertEqual(response.headers.get("X-Ethen-Cortex-Route-Profile"), "research", "Cortex route profile header is returned");
  assertEqual(response.headers.get("X-Ethen-Runtime-Provider"), "openai", "runtime provider header is returned");
  assert(encodedReceipt !== null, "safe receipt header is returned");
  assertEqual(response.headers.get("X-Ethen-Cortex-Run-Id"), "run-test", "run id header is returned for finalized-receipt lookup");
  assert(response.headers.get("X-Ethen-Cortex-Receipt-Summary") !== null, "receipt summary header is returned");
  assert(body.includes('data: {"t":"Hello"}'), "first text chunk is streamed");
  assert(body.includes('data: {"t":" world"}'), "second text chunk is streamed");
  assert(body.includes('data: {"done":true,"model":"o3-mini"}'), "done event preserves model metadata");

  assertEqual(calls.length, 1, "live route invokes Cortex exactly once");
  assertEqual(calls[0]?.selectedMode ?? null, "research", "selected mode is forwarded to Cortex");
  assertEqual(calls[0]?.messages[0]?.content ?? null, "Research the latest gateway routing approach", "user message is forwarded to Cortex");
  assertEqual(calls[0]?.agent?.routeId ?? null, "text-reasoning", "agent route flows into Cortex request");
  assertEqual(persisted.length, 1, "assistant transcript is persisted after stream completion");
  assertEqual(persisted[0]?.[1]?.content ?? "", "Hello world", "persisted assistant content matches streamed text");

  const trace = traceDataFromHeaders({
    "X-Ethen-Cortex-Receipt": encodedReceipt ?? "",
  });
  assert(trace?.receipt != null, "trace parser consumes the safe receipt header");
  assertEqual(trace?.receipt?.provider?.selectedModel, "redacted", "safe receipt redacts selected model");
  assertEqual(trace?.receipt?.usage?.latencyMs, undefined, "safe receipt does not fabricate latency");
  assertEqual(trace?.receipt?.usage?.timeToFirstTokenMs, 180, "safe receipt preserves observed timing");
}

async function testRouteFallsBackToAutoModeWhenMissing(): Promise<void> {
  console.log("\n[Route — mode fallback]");

  let selectedModeSeen: string | null = null;

  const response = await createChatbotAgentResponse(
    createRequest({
      message: "hello",
      sessionId: "mock-session",
    }),
    {
      hasSupabaseEnvFn: () => false,
      runCortexChatFn: async (params: CortexRequestParams) => {
        selectedModeSeen = params.selectedMode ?? null;
        return {
          result: createGatewayResult(),
          receipt: createReceipt(),
          classification: createClassification(),
          effectiveMode: "research",
          cortexProfile: null,
        };
      },
    },
  );

  await readResponseBody(response);
  assertEqual(selectedModeSeen, "auto", "missing selected mode defaults to auto");
}

async function testRouteReturnsSseErrorForInvalidBody(): Promise<void> {
  console.log("\n[Route — invalid request]");

  const response = await createChatbotAgentResponse(createRequest({ message: "   " }));
  const body = await readResponseBody(response);

  assertEqual(response.headers.get("content-type"), "text/event-stream", "errors still use SSE content type");
  assert(body.includes('"error":"Message is required."'), "missing message returns SSE error payload");
}

function testLivePathUsesCortexImplementation(): void {
  assertEqual(CHATBOT_AGENT_CHAT_ENDPOINT, "/api/chatbot-agent/chat", "chatbot hook points at the live chatbot route");

  const helperPath = path.resolve(process.cwd(), "lib/cortex/chatbot-agent-route.ts");
  const source = fs.readFileSync(helperPath, "utf8");
  assert(source.includes("runCortexChat"), "chatbot route helper is Cortex-backed");
  assert(!source.includes("openAIProviderAdapter"), "chatbot route helper does not bypass Cortex to raw OpenAI");
}

async function run() {
  await testRouteUsesCortexAndStreamsSse();
  await testRouteFallsBackToAutoModeWhenMissing();
  await testRouteReturnsSseErrorForInvalidBody();
  testLivePathUsesCortexImplementation();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
