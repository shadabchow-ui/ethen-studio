import "server-only";

import { createClient } from "@ethen/database/server";
import { hasSupabaseEnv } from "@ethen/config/runtime-flags";
import { finalizeCortexReceiptVerification } from "./route-receipt";
import { recordCortexRunAsync } from "./persistence";
import { buildCortexTraceSpans } from "./trace-spans";
import type { RunCortexChatResult } from "./run-cortex-chat";
import type { EthenMode, EthenRouteReceipt } from "./types";

export interface FinalizeAndPersistCortexRunParams {
  cortexResult: RunCortexChatResult;
  userRequest: string;
  outputText: string;
  sessionId?: string | null;
  selectedMode?: EthenMode | "auto" | null;
  projectId?: string | null;
  /**
   * Slice D: canonical P09/P30 correlation ids, passed through to
   * persistence when the caller established a canonical binding. Optional;
   * omission records the turn as unbound (never fake-bound).
   */
  canonicalRunId?: string | null;
  canonicalAttemptId?: string | null;
  canonicalOutcomeId?: string | null;
  getCurrentUserIdFn?: () => Promise<string | null>;
  recordCortexRunFn?: typeof recordCortexRunAsync;
  hasSupabaseEnvFn?: () => boolean;
}

async function defaultGetCurrentUserId(): Promise<string | null> {
  try {
    const { isClerkConfigured, resolveClerkSupabaseMapping } = await import("@ethen/database/clerk-supabase");
    if (isClerkConfigured()) {
      const mapping = await resolveClerkSupabaseMapping();
      if (mapping.state === "mapped" && mapping.supabaseUserId) {
        return mapping.supabaseUserId;
      }
    }
  } catch {
    // Fall through to Supabase SSR
  }

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

/**
 * Shared by /api/chat and the chatbot-agent route: runs the verifier against
 * the completed streamed output and persists the run fire-and-forget, so
 * both live chat paths finalize and store receipts identically. Never
 * throws — persistence failures must not affect the caller's stream.
 */
export async function finalizeAndPersistCortexRun(
  params: FinalizeAndPersistCortexRunParams
): Promise<EthenRouteReceipt> {
  const {
    cortexResult,
    userRequest,
    outputText,
    sessionId,
    selectedMode,
    projectId,
    canonicalRunId,
    canonicalAttemptId,
    canonicalOutcomeId,
  } = params;
  const getCurrentUserIdFn = params.getCurrentUserIdFn ?? defaultGetCurrentUserId;
  const recordCortexRunFn = params.recordCortexRunFn ?? recordCortexRunAsync;
  const hasSupabaseEnvFn = params.hasSupabaseEnvFn ?? hasSupabaseEnv;

  const finalReceipt = finalizeCortexReceiptVerification({
    receipt: cortexResult.receipt,
    cortexProfile: cortexResult.cortexProfile,
    classification: cortexResult.classification,
    userRequest,
    outputText,
  });

  if (hasSupabaseEnvFn()) {
    try {
      const userId = await getCurrentUserIdFn();
      if (userId) {
        recordCortexRunFn({
          userId,
          sessionId,
          projectId: projectId ?? null,
          selectedMode: selectedMode ?? null,
          receipt: finalReceipt,
          spans: buildCortexTraceSpans({ ...cortexResult, receipt: finalReceipt }),
          latencyMs: finalReceipt.usage.timeToFirstTokenMs ?? null,
          ...(canonicalRunId ? { canonicalRunId } : {}),
          ...(canonicalAttemptId ? { canonicalAttemptId } : {}),
          ...(canonicalOutcomeId ? { canonicalOutcomeId } : {}),
        });
      }
    } catch (error) {
      console.warn(
        "[cortex] finalizeAndPersistCortexRun skipped persistence:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return finalReceipt;
}
