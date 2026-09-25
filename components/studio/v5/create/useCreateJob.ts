/**
 * STUDIO_09 — shared create generation hook.
 *
 * One admission journey for image/video/music/SFX: resolve endpoint →
 * pin quote → admit idempotently → poll to terminal. A changed model
 * or changed parameters invalidates the pinned quote before Generate
 * can admit. Voice/transcribe slots stay unavailable until STUDIO_11
 * binds them; the hook refuses to admit for unbound slots.
 */

"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAuthActionGate } from "@/components/studio/auth/studio-auth-action";
import type { CreateToolDefinition } from "./types";
import { toolTaskName } from "./tool-definitions";
import { buildAdmitBody, buildEstimateBody, buildResolveBody } from "./composer-request";
import { hashCreateRequest, idempotencyKeyFor } from "./idempotency";
import {
  INITIAL_QUOTE_STATE,
  quoteMatchesSelection,
  quoteNeedsReapproval,
  quoteReducer,
} from "./quote-machine";
import {
  isTerminalJobStatus,
  parseAdmittedJob,
  parsePolledJob,
  parseQuote,
  parseRouteDecision,
  type CreateApiError,
  type PolledJobView,
  type QuoteView,
  type RouteDecisionView,
} from "./create-api-client";

export type CreatePhase = "idle" | "routing" | "estimating" | "admitting" | "running" | "done" | "failed";

export interface UseCreateJobInput {
  projectId: string | null;
  tool: CreateToolDefinition;
  /** "auto" or an explicit endpoint id. */
  modelSelection: string;
  /** Normalized core parameters (prompt/script, schema values, references). */
  parameters: Readonly<Record<string, unknown>>;
  /** Approved spend cap in ICU, or null for no cap. */
  capIcu: number | null;
  pollIntervalMs?: number;
}

export interface UseCreateJobResult {
  phase: CreatePhase;
  decision: RouteDecisionView | null;
  quote: QuoteView | null;
  job: PolledJobView | null;
  error: CreateApiError | null;
  /** True when the pinned quote no longer matches model/parameters. */
  quoteStale: boolean;
  /** True when a fresh estimate exceeded the prior quote by >10%. */
  reapprovalRequired: boolean;
  busy: boolean;
  generate: () => void;
  retry: () => void;
  reset: () => void;
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const parsed = (await response.json().catch(() => null)) as unknown;
  // S4C: pre-gated callers never reach this signed-out, but an expired
  // session mid-journey still opens the modal instead of a dead error.
  if (response.status === 401) {
    const { translateStudioAuthFailure } = await import("@/components/studio/auth/studio-auth-action");
    const root = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    const error = root !== null && typeof root["error"] === "object" && root["error"] !== null ? (root["error"] as Record<string, unknown>) : null;
    const code = typeof error?.["code"] === "string" ? (error["code"] as string) : typeof root?.["code"] === "string" ? (root["code"] as string) : null;
    translateStudioAuthFailure(response.status, code, "create-generate");
  }
  return parsed;
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store" });
  return (await response.json().catch(() => null)) as unknown;
}

export function useCreateJob(input: UseCreateJobInput): UseCreateJobResult {
  const { projectId, tool, modelSelection, parameters, capIcu, pollIntervalMs = 3000 } = input;
  const [phase, setPhase] = useState<CreatePhase>("idle");
  const [decision, setDecision] = useState<RouteDecisionView | null>(null);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [job, setJob] = useState<PolledJobView | null>(null);
  const [error, setError] = useState<CreateApiError | null>(null);
  const [quoteState, dispatchQuote] = useReducer(quoteReducer, INITIAL_QUOTE_STATE);
  const [reapprovalRequired, setReapprovalRequired] = useState(false);
  const [paramsHash, setParamsHash] = useState<string>("");
  const cancelledRef = useRef(false);
  const pollTimer = useRef<number | null>(null);

  const task = toolTaskName(tool);
  // S4C auth-on-action: anonymous Generate opens the Clerk modal and sends
  // NO request; caller-owned draft state is untouched so the user retries
  // from the identical prepared state after signing in.
  const authGate = useAuthActionGate();

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // Any model or parameter change invalidates the pinned quote.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hash = await hashCreateRequest({ modelSelection, parameters });
      if (cancelled) return;
      setParamsHash((previous) => {
        if (previous !== "" && previous !== hash) dispatchQuote({ type: "PARAMS_CHANGED" });
        return hash;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [modelSelection, parameters]);

  useEffect(() => {
    dispatchQuote({ type: "MODEL_CHANGED" });
  }, [modelSelection]);

  const quoteStale = useMemo(() => {
    if (quoteState.status !== "quoted" || !decision || !paramsHash) return quote !== null;
    return !quoteMatchesSelection(quoteState, { endpointId: decision.endpointId, paramsHash });
  }, [quoteState, decision, paramsHash, quote]);

  const pollJob = useCallback(
    (jobId: string, scopeProjectId: string) => {
      stopPolling();
      const tick = async () => {
        if (cancelledRef.current) return;
        try {
          const parsed = parsePolledJob(
            await getJson(`/api/studio/v1/jobs/${encodeURIComponent(jobId)}?projectId=${encodeURIComponent(scopeProjectId)}`),
          );
          if (cancelledRef.current) return;
          if (parsed.error || !parsed.job) {
            setError(parsed.error ?? { code: "UNKNOWN", message: "Job read failed.", retryable: true });
            setPhase("failed");
            return;
          }
          setJob(parsed.job);
          if (isTerminalJobStatus(parsed.job.status)) {
            setPhase(parsed.job.status === "COMPLETED" ? "done" : "failed");
            if (parsed.job.status === "FAILED" && !parsed.job.retryable) {
              setError({ code: "PROVIDER_ERROR", message: "This run failed. Charged outputs, if any, are on the receipt.", retryable: false });
            }
            return;
          }
          pollTimer.current = window.setTimeout(() => void tick(), pollIntervalMs);
        } catch {
          if (cancelledRef.current) return;
          setError({ code: "NETWORK_ERROR", message: "Lost contact with the job. Retry to resume polling.", retryable: true });
          setPhase("failed");
        }
      };
      pollTimer.current = window.setTimeout(() => void tick(), pollIntervalMs);
    },
    [pollIntervalMs, stopPolling],
  );

  const runGenerate = useCallback(() => {
    if (!projectId) {
      setError({ code: "SETUP_REQUIRED", message: "Select a project before generating.", retryable: false });
      return;
    }
    if (!task) {
      setError({ code: "SLOT_UNBOUND", message: "This tool is not available yet — batch audio arrives in the next milestone.", retryable: false });
      return;
    }
    if (phase === "routing" || phase === "estimating" || phase === "admitting") return;
    cancelledRef.current = false;
    stopPolling();
    setError(null);
    setReapprovalRequired(false);
    setJob(null);

    void (async () => {
      try {
        // 1. Resolve endpoint (Auto or explicit pin).
        setPhase("routing");
        const resolved = parseRouteDecision(
          await postJson("/api/studio/v1/catalog/resolve", buildResolveBody({ projectId, task, modelSelection, capIcu })),
        );
        if (cancelledRef.current) return;
        if (resolved.error || !resolved.decision) {
          setError(resolved.error ?? { code: "UNKNOWN", message: "Model routing failed.", retryable: true });
          setPhase("failed");
          return;
        }
        setDecision(resolved.decision);

        // 2. Pin a quote for the resolved endpoint.
        setPhase("estimating");
        dispatchQuote({ type: "REQUEST_ESTIMATE" });
        const estimated = parseQuote(
          await postJson(
            "/api/studio/v1/economics/estimate",
            buildEstimateBody({
              projectId,
              task,
              endpointId: resolved.decision.endpointId,
              meterQuantity: resolved.decision.meterQuantity,
              priceVersion: resolved.decision.priceVersion,
              capIcu,
            }),
          ),
        );
        if (cancelledRef.current) return;
        if (estimated.error || !estimated.quote) {
          dispatchQuote({ type: "ESTIMATE_FAILED", message: estimated.error?.message ?? "Estimate failed." });
          setError(estimated.error ?? { code: "UNKNOWN", message: "Estimate failed.", retryable: true });
          setPhase("failed");
          return;
        }
        if (quote && quoteNeedsReapproval(quote.estimatedIcu, estimated.quote.estimatedIcu)) {
          setReapprovalRequired(true);
          setQuote(estimated.quote);
          setError({ code: "APPROVAL_REQUIRED", message: "The new estimate exceeds the prior quote by more than 10%. Review and generate again to approve.", retryable: false });
          setPhase("failed");
          return;
        }
        const hash = await hashCreateRequest({ modelSelection, parameters });
        dispatchQuote({
          type: "ESTIMATE_OK",
          quoteId: estimated.quote.quoteId,
          endpointId: resolved.decision.endpointId,
          paramsHash: hash,
          estimatedIcu: estimated.quote.estimatedIcu,
          capIcu: estimated.quote.capIcu,
          expiresAt: estimated.quote.expiresAt,
        });
        setQuote(estimated.quote);

        // 3. Admit idempotently.
        setPhase("admitting");
        const admitted = parseAdmittedJob(
          await postJson(
            "/api/studio/v1/jobs",
            buildAdmitBody({
              projectId,
              task,
              idempotencyKey: idempotencyKeyFor(tool.id, hash),
              requestHash: hash,
              quoteId: estimated.quote.quoteId,
              endpointId: resolved.decision.endpointId,
              parameters,
            }),
          ),
        );
        if (cancelledRef.current) return;
        if (admitted.error || !admitted.job) {
          setError(admitted.error ?? { code: "UNKNOWN", message: "Job admission failed.", retryable: true });
          setPhase("failed");
          return;
        }
        setJob(admitted.job);
        if (isTerminalJobStatus(admitted.job.status)) {
          setPhase(admitted.job.status === "COMPLETED" ? "done" : "failed");
          return;
        }
        setPhase("running");
        pollJob(admitted.job.jobId, projectId);
      } catch {
        if (cancelledRef.current) return;
        setError({ code: "NETWORK_ERROR", message: "Request failed before reaching the server. Retry to continue.", retryable: true });
        setPhase("failed");
      }
    })();
  }, [projectId, task, phase, modelSelection, parameters, capIcu, quote, stopPolling, pollJob, tool.id]);

  const generate = useCallback(() => {
    authGate.runAuthed(runGenerate, "create-generate");
  }, [authGate, runGenerate]);

  const retry = useCallback(() => {
    // Error retry resumes polling when a job exists, else restarts the journey.
    if (job && !isTerminalJobStatus(job.status) && projectId) {
      setError(null);
      setPhase("running");
      pollJob(job.jobId, projectId);
      return;
    }
    dispatchQuote({ type: "RESET" });
    setQuote(null);
    generate();
  }, [job, projectId, pollJob, generate]);

  const reset = useCallback(() => {
    stopPolling();
    setPhase("idle");
    setDecision(null);
    setQuote(null);
    setJob(null);
    setError(null);
    setReapprovalRequired(false);
    dispatchQuote({ type: "RESET" });
  }, [stopPolling]);

  return {
    phase,
    decision,
    quote,
    job,
    error,
    quoteStale,
    reapprovalRequired,
    busy: phase === "routing" || phase === "estimating" || phase === "admitting" || phase === "running",
    generate,
    retry,
    reset,
  };
}
