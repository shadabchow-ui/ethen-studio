import type { NextRequest } from "next/server";
import { runCortexChat } from "./run-cortex-chat";
import {
  redactCortexRouteReceipt,
  summarizeCortexRouteReceipt,
} from "./route-receipt";
import { randomUUID } from "node:crypto";
import { recordCortexRunAsync } from "./persistence";
import {
  closeBotCanonicalTurn,
  openBotCanonicalTurn,
  resolveBotCanonicalScope,
} from "./canonical-turn";
import type { BotTurnHandle } from "./canonical-turn";
import { finalizeAndPersistCortexRun } from "./finalize-and-persist";
import type { EthenMode } from "./types";
import { getAgentBySlug } from "../agents/queries";
import { insertServerMessages, createServerSession } from "../../../account/src/server";
import { hasSupabaseEnv } from "@ethen/config/runtime-flags";
import { createClient } from "@ethen/database/server";
import { GatewayError } from "@ethen/models/gateway/errors";
import type {Session} from "../../../account/src/index";

type ChatbotAgentBody = {
  message?: string;
  model?: string;
  sessionId?: string;
  agentSlug?: string;
  mode?: string;
  selectedMode?: string;
  /** Durable attachment references (bytes stay in private storage; resolved server-side). */
  attachments?: Array<{ assetId?: string; projectId?: string }>;
};

/** JOB 7 — at most this many attachment references per chatbot-agent request. */
const MAX_CHATBOT_ATTACHMENT_REFS = 5;

export interface ChatbotAgentRouteDependencies {
  getAgentBySlugFn?: typeof getAgentBySlug;
  getAgentBySlugImpl?: typeof getAgentBySlug;
  hasSupabaseEnvFn?: () => boolean;
  hasSupabaseEnvImpl?: () => boolean;
  insertServerMessagesFn?: typeof insertServerMessages;
  insertServerMessagesImpl?: typeof insertServerMessages;
  runCortexChatFn?: typeof runCortexChat;
  runCortexChatImpl?: typeof runCortexChat;
  recordCortexRunFn?: typeof recordCortexRunAsync;
  recordCortexRunImpl?: typeof recordCortexRunAsync;
  getCurrentUserIdFn?: () => Promise<string | null>;
  getCurrentUserIdImpl?: () => Promise<string | null>;
}

async function defaultGetCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function isRealSessionId(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;
  return !sessionId.startsWith("mock-") && !sessionId.startsWith("demo-");
}

function extractDraftSlug(sessionId: string): string | null {
  if (!sessionId.startsWith("draft-")) return null;
  const afterDraft = sessionId.slice(6);
  return afterDraft.includes("~") ? afterDraft.split("~")[0] : afterDraft;
}

async function materializeDraftSession(
  sessionId: string,
  firstUserMessage: string,
): Promise<{ session: Session | null; realId: string }> {
  const slug = extractDraftSlug(sessionId);
  if (!slug) return { session: null, realId: sessionId };

  const agent = getAgentBySlug(slug);
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  const title =
    cleaned.length > 0
      ? cleaned.length > 80
        ? `${cleaned.slice(0, 79).trimEnd()}…`
        : cleaned
      : agent?.name ?? slug;
  const session = await createServerSession({
    agent_id: agent?.id ?? undefined,
    title,
    workspace_archetype: agent?.workspace_archetype ?? "generic_chat",
    model_route: agent?.route_id ?? undefined,
  });

  return { session, realId: session?.id ?? sessionId };
}

function isValidCortexMode(value: string): value is EthenMode {
  return ["cortex-lite", "cortex", "cortex-pro", "code", "research", "writer", "operator", "auto"].includes(value);
}

function resolveSelectedMode(body: ChatbotAgentBody): EthenMode | "auto" {
  const raw = body.selectedMode ?? body.mode;
  if (typeof raw === "string" && isValidCortexMode(raw)) {
    return raw;
  }
  return "auto";
}

function sseError(message: string, errorCode?: string): Response {
  const payload: Record<string, string> = { error: message };
  if (errorCode) payload.errorCode = errorCode;
  return new Response(`data: ${JSON.stringify(payload)}\n\n`, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...(errorCode ? { "X-Ethen-Error-Code": errorCode } : {}),
    },
  });
}

function buildUserFacingError(err: unknown): { message: string; errorCode: string } {
  if (err instanceof GatewayError) {
    const code = err.code;
    const details = err.details as Record<string, unknown> | undefined;

    switch (code) {
      case "provider_key_missing": {
        const missingEnv = details?.missingEnv as string | undefined;
        const provider = (details?.provider as string) ?? "AI provider";
        return {
          message: missingEnv
            ? `${provider} is not configured: missing ${missingEnv}. Set your API key in environment variables or enable mock mode.`
            : `${provider} API key is not configured. Set your API key or enable mock mode.`,
          errorCode: code,
        };
      }
      case "provider_env_missing":
        return {
          message: "No AI provider is configured. Set at least one provider API key (e.g. DEEPSEEK_API_KEY) or enable mock mode.",
          errorCode: code,
        };
      case "provider_unavailable":
        return {
          message: "The selected AI provider is currently unavailable. The provider may be experiencing an outage or your API key may be invalid.",
          errorCode: code,
        };
      case "provider_error":
        return {
          message: "The AI provider returned an error. This may be a temporary issue. Try again or switch providers.",
          errorCode: code,
        };
      case "provider_stream_error":
        return {
          message: "The response stream was interrupted. Please try again.",
          errorCode: code,
        };
      case "messages_required":
        return {
          message: "No message content was provided.",
          errorCode: code,
        };
      default:
        return {
          message: err.message || "An unexpected error occurred with the AI provider.",
          errorCode: code,
        };
    }
  }

  const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
  return { message: msg, errorCode: "unknown_error" };
}

function buildResponseHeaders(cortexResult: Awaited<ReturnType<typeof runCortexChat>>): Headers {
  const { route } = cortexResult.result;
  const { receipt } = cortexResult;
  const safeReceipt = redactCortexRouteReceipt(receipt, "advanced");

  const headers = new Headers({
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  headers.set("X-Ethen-Runtime-Mode", route.mode);
  headers.set("X-Ethen-Runtime-Provider", route.providerId);
  headers.set("X-Ethen-Runtime-Route", route.routeId);
  headers.set("X-Ethen-Runtime-Source", route.source);
  if (route.fallbackUsed) {
    headers.set("X-Ethen-Runtime-Fallback", "1");
    if (route.fallbackReason) {
      headers.set("X-Ethen-Runtime-Fallback-Reason", route.fallbackReason.slice(0, 200));
    }
  }

  headers.set("X-Ethen-Cortex-Mode", receipt.mode);
  headers.set("X-Ethen-Cortex-Intent", receipt.intent);
  headers.set("X-Ethen-Cortex-Route-Profile", receipt.routeProfile);
  headers.set("X-Ethen-Cortex-Receipt", encodeURIComponent(JSON.stringify(safeReceipt)));
  headers.set("X-Ethen-Cortex-Receipt-Summary", summarizeCortexRouteReceipt(receipt));
  headers.set("X-Ethen-Cortex-Confidence", String(cortexResult.classification.confidence));
  // Run id only — verifier has not run yet here. The finalized receipt is
  // fetchable post-stream via GET /api/cortex/runs/[runId] once persisted.
  headers.set("X-Ethen-Cortex-Run-Id", receipt.runId);

  return headers;
}

export async function createChatbotAgentResponse(
  request: Request | NextRequest,
  deps: ChatbotAgentRouteDependencies = {},
): Promise<Response> {
  const getAgentBySlugFn = deps.getAgentBySlugFn ?? deps.getAgentBySlugImpl ?? getAgentBySlug;
  const hasSupabaseEnvFn = deps.hasSupabaseEnvFn ?? deps.hasSupabaseEnvImpl ?? (() => hasSupabaseEnv());
  const insertServerMessagesFn = deps.insertServerMessagesFn ?? deps.insertServerMessagesImpl ?? insertServerMessages;
  const runCortexChatFn = deps.runCortexChatFn ?? deps.runCortexChatImpl ?? runCortexChat;
  const recordCortexRunFn = deps.recordCortexRunFn ?? deps.recordCortexRunImpl ?? recordCortexRunAsync;
  const getCurrentUserIdFn = deps.getCurrentUserIdFn ?? deps.getCurrentUserIdImpl ?? defaultGetCurrentUserId;

  let body: ChatbotAgentBody;
  try {
    body = (await request.json()) as ChatbotAgentBody;
  } catch {
    return sseError("Invalid request body.");
  }

  const message = body.message?.trim();
  if (!message) {
    return sseError("Message is required.");
  }

  let sessionId = typeof body.sessionId === "string" && body.sessionId.trim()
    ? body.sessionId.trim()
    : null;

  // Materialize draft sessions on first meaningful user input.
  // Sessions are only persisted after the first non-empty message,
  // so empty New Chat / Fleet launches never create stored sessions.
  let realSessionId = sessionId;
  if (hasSupabaseEnvFn() && sessionId?.startsWith("draft-")) {
    const materialized = await materializeDraftSession(sessionId, message);
    if (materialized.session) {
      realSessionId = materialized.realId;
      sessionId = materialized.realId;
    }
  }

  const selectedMode = resolveSelectedMode(body);
  const requestedModel = typeof body.model === "string" && body.model.trim()
    ? body.model.trim()
    : null;
  const agent =
    typeof body.agentSlug === "string"
      ? getAgentBySlugFn(body.agentSlug)
      : undefined;

  // P29 canonical binding, BEFORE the provider is invoked. Admission that
  // runs after a model call has already started cannot prevent the spend it
  // exists to gate, so the turn is admitted and bound to a real P09 run
  // first. With no canonical scope the turn stays explicitly UNBOUND —
  // truthful, and never fake-bound.
  const persistEnabled = hasSupabaseEnvFn() && isRealSessionId(realSessionId);
  const turnRequestId = randomUUID();
  let turnHandle: BotTurnHandle | null = null;
  if (persistEnabled && realSessionId) {
    const userId = await getCurrentUserIdFn();
    const canonicalScope = userId ? await resolveBotCanonicalScope({ userId, projectId: null }) : null;
    // Bind only with a full canonical scope. Without a project there is no
    // P09 run to bind to, and the turn stays explicitly UNBOUND.
    if (canonicalScope?.projectId) {
      const opened = await openBotCanonicalTurn({
        scope: canonicalScope,
        conversationId: realSessionId,
        taskId: turnRequestId,
        requestId: turnRequestId,
        toolClasses: [],
      });
      if (opened.state === "refused") {
        return sseError(opened.reason, opened.code);
      }
      turnHandle = opened.handle;
    }
  }

  // JOB 7 — resolve durable attachment references into model-ready content.
  // Lazy imports keep the storage stack out of the unit-test module graph
  // unless attachments are actually used.
  const attachmentRefs = Array.isArray(body.attachments)
    ? body.attachments.filter(
        (ref): ref is { assetId: string; projectId: string } =>
          typeof ref?.assetId === "string" && ref.assetId !== "" &&
          typeof ref?.projectId === "string" && ref.projectId !== "",
      )
    : [];
  if (attachmentRefs.length > MAX_CHATBOT_ATTACHMENT_REFS) {
    return sseError(`At most ${MAX_CHATBOT_ATTACHMENT_REFS} attachments per request.`);
  }
  let attachmentContent: Array<
    { type: "text"; text: string } | { type: "image"; mediaType: "image/png" | "image/jpeg" | "image/webp"; data: string }
  > = [];
  if (attachmentRefs.length > 0) {
    try {
      const { requireProject } = await import("../platform/auth/guards");
      for (const projectId of new Set(attachmentRefs.map((ref) => ref.projectId))) {
        const membership = await requireProject({ api: true, projectId });
        if (membership.response) return sseError("Attachment project access denied.");
      }
      const { AttachmentService } = await import("@ethen/database/attachments/service");
      const resolved = await new AttachmentService().resolveModelContent(attachmentRefs);
      attachmentContent = [
        ...resolved.textBlocks.map((block) => ({
          type: "text" as const,
          text: `\n\n[Attachment: ${block.name}]\n${block.text}`,
        })),
        ...resolved.parts,
      ];
    } catch {
      return sseError("Attachments could not be resolved.");
    }
  }

  let cortexResult: Awaited<ReturnType<typeof runCortexChat>>;
  try {
    cortexResult = await runCortexChatFn({
      sessionId,
      messages: [
        {
          role: "user",
          content: attachmentContent.length > 0 ? [{ type: "text" as const, text: message }, ...attachmentContent] : message,
        },
      ],
      selectedMode,
      agent: agent
        ? {
            id: agent.id ?? null,
            slug: agent.slug ?? null,
            name: agent.name ?? null,
            routeId: agent.route_id ?? null,
            creditCost: agent.credit_cost ?? null,
          }
        : null,
    });
  } catch (err) {
    // The turn was admitted and bound before the provider ran, so a provider
    // failure is recorded against the canonical run rather than vanishing.
    if (turnHandle) {
      await closeBotCanonicalTurn({ handle: turnHandle, status: "failed", receipt: null });
    }
    const { message, errorCode } = buildUserFacingError(err);
    return sseError(message, errorCode);
  }

  const textStream = cortexResult.result.textStream;
  const encoder = new TextEncoder();
  const responseHeaders = buildResponseHeaders(cortexResult);
  if (realSessionId && realSessionId !== body.sessionId) {
    responseHeaders.set("X-Ethen-Session-Id", realSessionId);
  }

  const responseStream = new ReadableStream({
    async start(controller) {
      const reader = textStream.getReader();
      let assistantText = "";
      let streamOk = true;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          assistantText += value;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ t: value })}\n\n`),
          );
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, model: cortexResult.result.route.selectedModelAlias ?? requestedModel ?? undefined })}\n\n`,
          ),
        );
      } catch (err) {
        streamOk = false;
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`),
        );
      } finally {
        controller.close();
        reader.releaseLock();
      }

      if (persistEnabled && sessionId && assistantText && streamOk) {
        try {
          await insertServerMessagesFn([
            { session_id: sessionId, role: "user", content: message },
            { session_id: sessionId, role: "assistant", content: assistantText },
          ]);
        } catch {
          // Non-fatal persistence failure should not interrupt the stream.
        }
      }

      if (persistEnabled) {
        try {
          // Final verification runs here, once the full streamed output is
          // known. Response headers (X-Ethen-Cortex-Receipt) were already
          // sent with the pre-stream (pending) receipt — SSE has no trailer
          // mechanism in this protocol — so the finalized receipt is
          // delivered to clients via GET /api/cortex/runs/[runId] instead,
          // once persisted below (shared with the /api/chat path).
          // P30 outcome first, so the persisted Cortex run can carry the
          // canonical outcome id. A failed outcome write is recorded as an
          // unbound outcome rather than an invented one.
          let canonicalOutcomeId: string | null = null;
          if (turnHandle) {
            const closed = await closeBotCanonicalTurn({
              handle: turnHandle,
              status: streamOk ? "completed" : "failed",
              receipt: cortexResult.receipt,
            });
            if (closed.state === "recorded") canonicalOutcomeId = closed.outcomeId;
          }
          await finalizeAndPersistCortexRun({
            cortexResult,
            userRequest: message,
            outputText: streamOk ? assistantText : "",
            sessionId,
            selectedMode,
            projectId: null,
            canonicalRunId: turnHandle?.canonicalRunId ?? null,
            canonicalAttemptId: turnHandle?.canonicalAttemptId ?? null,
            canonicalOutcomeId,
            getCurrentUserIdFn,
            recordCortexRunFn,
          });
        } catch {
          // Non-fatal: Cortex run persistence must never affect the stream.
        }
      }
    },
  });

  return new Response(responseStream, {
    headers: responseHeaders,
  });
}

export async function buildChatbotAgentResponse(
  body: ChatbotAgentBody,
  deps: ChatbotAgentRouteDependencies = {},
): Promise<Response> {
  const request = new Request("http://localhost/api/chatbot-agent/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  return createChatbotAgentResponse(request, deps);
}
