/**
 * Studio V5 providers — generic fal queue adapter (STUDIO M4). Server-only.
 *
 * One adapter for every catalog endpoint served by fal: the endpoint id
 * and its pinned M2 spec drive request construction (URL + validated body),
 * queue lifecycle (submit → poll → outputs → cancel), and task-family
 * output normalization. No per-model code and no hardcoded model id: the
 * single-model guard is deleted, and unknown endpoints, missing specs,
 * and missing credentials all fail closed with explicit codes.
 *
 * Durability: the submitted request id is persisted to the operation store
 * before submit returns; restarts resume from that row. Ambiguous submits
 * (transport died around the send) persist first, then throw
 * DISPATCH_UNCERTAIN so the worker reconciles instead of blind-retrying.
 *
 * Fixture lane: tests run against a loopback fixture queue only. In
 * NODE_ENV=test the default transport throws on any non-loopback URL
 * before the first byte moves, so a forgotten stub can never touch paid
 * endpoints (explicitly injected doubles are the test's own transport).
 */
import "server-only";

import type { TaskName } from "../../../contracts/tasks";
import type { EndpointSpec } from "../../../catalog/types";
import type {
  ProviderAdapterPort,
  ProviderOperationState,
  ProviderOutputDescriptor,
  ProviderSubmitContext,
  ProviderUsageReport,
  UsageEstimate,
} from "../../ports/provider-adapter";
import { FAL_ADAPTER_NAME, FAL_ADAPTER_VERSION } from "../fal-constants";
import { ProviderError, redactProviderText } from "../types";
import { createMemoryOperationStore, type ProviderOperationStore } from "../operation-store";
import {
  FAL_QUEUE_BASE_URL,
  buildFalQueueRequest,
  queueUrlForEndpoint,
} from "../fal-request";
import { normalizeFalOutputs } from "../fal-outputs";

/** Canonical tasks served through fal queue endpoints (M2 task map). */
export const FAL_SUPPORTED_TASKS: readonly TaskName[] = [
  "image.generate",
  "image.edit",
  "video.generate",
  "video.edit",
  "speech.synthesize",
  "audio.generate",
  "music.generate",
  "mesh.generate",
];

export interface FalAdapterConfig {
  fetchImpl?: typeof fetch;
  getApiKey?: () => string | null;
  store?: ProviderOperationStore;
  timeoutMs?: number;
  /** Spec resolution for submit validation; absent fails submit closed. */
  resolveSpec?: (endpointId: string) => Promise<EndpointSpec | null>;
  /**
   * Queue base override. Production refuses anything but the default;
   * tests require loopback. Fixture/dev servers pass their URL here.
   */
  queueBaseUrl?: string;
  /** Public callback URL for queue webhooks (polling stays the fallback). */
  webhookUrl?: string | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Hosts the default queue base may return for poll/result callbacks. */
const ALLOWED_FAL_CALLBACK_HOSTS: readonly string[] = ["queue.fal.run", "fal.run", "fal.ai"];
/** Hosts result payloads may reference (callbacks plus fal object stores). */
const ALLOWED_FAL_RESULT_HOSTS: readonly string[] = [
  ...ALLOWED_FAL_CALLBACK_HOSTS,
  "fal.media",
  "v3.fal.media",
  "storage.fal.ai",
];

function defaultApiKey(): string | null {
  const key = process.env.FAL_KEY;
  return key && key.trim().length > 0 ? key : null;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  } catch {
    return false;
  }
}

function resolveQueueBase(override: string | undefined): string {
  if (!override) return FAL_QUEUE_BASE_URL;
  if (process.env.NODE_ENV === "production") {
    throw new ProviderError("SETUP_REQUIRED", "Queue base override is refused in production.");
  }
  return override.replace(/\/+$/, "");
}

function splitOperationId(operationId: string): { endpointId: string; requestId: string } | null {
  if (!operationId.startsWith("fal:")) return null;
  const rest = operationId.slice("fal:".length);
  const cut = rest.lastIndexOf(":");
  if (cut <= 0 || cut === rest.length - 1) return null;
  return { endpointId: rest.slice(0, cut), requestId: rest.slice(cut + 1) };
}

function idsFromOperationKey(operationKey: string): { jobId: string | null; attemptId: string | null } {
  const parts = operationKey.split(":");
  if (parts.length >= 4 && parts[0] === "op") {
    return { jobId: parts[1] || null, attemptId: parts[2] || null };
  }
  return { jobId: null, attemptId: null };
}

export function createFalProviderAdapter(config: FalAdapterConfig = {}): ProviderAdapterPort {
  const fetchImpl = config.fetchImpl ?? fetch;
  // The test-egress guard binds to the default transport only: an
  // explicitly injected fetch is a test double by construction, while a
  // forgotten stub would silently hit paid endpoints.
  const defaultTransport = fetchImpl === fetch;
  const getApiKey = config.getApiKey ?? defaultApiKey;
  const store = config.store ?? createMemoryOperationStore();
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const queueBaseUrl = resolveQueueBase(config.queueBaseUrl);
  const fixtureLane = isLoopbackUrl(queueBaseUrl);
  const baseOverridden = queueBaseUrl !== FAL_QUEUE_BASE_URL;

  /**
   * Queue-URL discipline (kept from STUDIO_06): the queue may only hand
   * back poll/result URLs it is allowed to serve. The default base pins
   * the fal host allowlist over https; an overridden (dev/fixture) base
   * pins same-origin instead, so loopback fixtures work without opening
   * arbitrary hosts.
   */
  function assertQueueUrl(value: string, kind: "status" | "response"): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new ProviderError("PROVIDER_FAILED", `Unsafe fal ${kind} URL rejected before fetch: unparseable.`);
    }
    if (baseOverridden) {
      if (parsed.origin !== new URL(queueBaseUrl).origin) {
        throw new ProviderError(
          "PROVIDER_FAILED",
          `Unsafe fal ${kind} URL rejected before fetch: host ${parsed.hostname} is not allowlisted.`,
        );
      }
      return;
    }
    if (parsed.protocol !== "https:") {
      throw new ProviderError("PROVIDER_FAILED", `Unsafe fal ${kind} URL rejected before fetch: non-https.`);
    }
    if (!ALLOWED_FAL_CALLBACK_HOSTS.includes(parsed.hostname)) {
      throw new ProviderError(
        "PROVIDER_FAILED",
        `Unsafe fal ${kind} URL rejected before fetch: host ${parsed.hostname} is not allowlisted.`,
      );
    }
  }

  /** Result-URL discipline: provider output URLs stay on fal object stores (or the fixture origin). */
  function assertResultUrl(value: string): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new ProviderError("PROVIDER_FAILED", "Unsafe fal result URL rejected before fetch: unparseable.");
    }
    if (baseOverridden) {
      if (parsed.origin !== new URL(queueBaseUrl).origin) {
        throw new ProviderError(
          "PROVIDER_FAILED",
          `Unsafe fal result URL rejected before fetch: host ${parsed.hostname} is not allowlisted.`,
        );
      }
      return;
    }
    if (parsed.protocol !== "https:") {
      throw new ProviderError("PROVIDER_FAILED", "Unsafe fal result URL rejected before fetch: non-https.");
    }
    if (!ALLOWED_FAL_RESULT_HOSTS.includes(parsed.hostname)) {
      throw new ProviderError(
        "PROVIDER_FAILED",
        `Unsafe fal result URL rejected before fetch: host ${parsed.hostname} is not allowlisted.`,
      );
    }
  }

  function requireKey(): string {
    const key = getApiKey();
    if (!key) {
      throw new ProviderError("SETUP_REQUIRED", "FAL credentials not configured.");
    }
    return key;
  }

  async function fetchOnce(input: { url: string; method: string; headers: Record<string, string>; body?: string }): Promise<{
    status: number;
    json: unknown;
  }> {
    if (process.env.NODE_ENV === "test" && defaultTransport && !isLoopbackUrl(input.url)) {
      throw new ProviderError("TRANSPORT", "Egress blocked in tests: the fal adapter only calls the loopback fixture queue.", false);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.body,
        redirect: "error",
        signal: controller.signal,
      });
      const json = await response.json().catch(() => null);
      return { status: response.status, json };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ProviderError("TRANSPORT", `fal queue request failed: ${redactProviderText(message)}`, true);
    } finally {
      clearTimeout(timer);
    }
  }

  function statusOf(status: number, message: string): ProviderError {
    if (status === 401 || status === 403) {
      return new ProviderError("AUTH", `fal queue rejected credentials: ${redactProviderText(message)}`, false);
    }
    if (status === 404) {
      return new ProviderError("NOT_FOUND", `fal queue object not found: ${redactProviderText(message)}`, false);
    }
    if (status === 429) {
      return new ProviderError("RATE_LIMITED", `fal queue rate limited: ${redactProviderText(message)}`, true);
    }
    if (status >= 500) {
      return new ProviderError("TRANSPORT", `fal queue unavailable: ${redactProviderText(message)}`, true);
    }
    return new ProviderError("PROVIDER_FAILED", `fal queue rejected the request: ${redactProviderText(message)}`, false);
  }

  async function resolveSubmitSpec(endpointId: string, ctx?: ProviderSubmitContext): Promise<EndpointSpec> {
    if (ctx?.spec && ctx.spec.endpointId === endpointId) return ctx.spec;
    if (!config.resolveSpec) {
      throw new ProviderError("SETUP_REQUIRED", `No spec reader configured for fal endpoint ${endpointId}.`);
    }
    const spec = await config.resolveSpec(endpointId);
    if (!spec) {
      throw new ProviderError("NOT_FOUND", `Unknown fal endpoint: ${endpointId}.`);
    }
    if (spec.adapterName !== FAL_ADAPTER_NAME) {
      throw new ProviderError(
        "INVALID_PARAMETERS",
        `Endpoint ${endpointId} is bound to ${spec.adapterName}, not ${FAL_ADAPTER_NAME}.`,
      );
    }
    return spec;
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  /**
   * Fixture-scripted usage (dev/fixture bases only). The production queue
   * reports no spend, so the default base always yields null; a fixture
   * may embed `usage: {provider_minor, meter_quantity}` in its result to
   * exercise real settlement math with scripted minor. Anything
   * unreadable yields null — usage unknown, never guessed.
   */
  async function readScriptedUsage(responseUrl: string | null): Promise<{
    providerMinor: number;
    quantity: number;
  } | null> {
    if (!baseOverridden || !responseUrl) return null;
    try {
      const apiKey = getApiKey();
      if (!apiKey) return null;
      const { status, json } = await fetchOnce({
        url: responseUrl,
        method: "GET",
        headers: { authorization: `Key ${apiKey}` },
      });
      if (status < 200 || status >= 300) return null;
      const usage = (json as { usage?: unknown } | null)?.usage as Record<string, unknown> | undefined;
      const minor = usage?.provider_minor;
      if (typeof minor !== "number" || !Number.isInteger(minor) || minor < 0) return null;
      const quantity = usage?.meter_quantity;
      return {
        providerMinor: minor,
        quantity: typeof quantity === "number" && Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
      };
    } catch {
      return null;
    }
  }

  /**
   * Persist an ambiguous submit before failing: the worker reconciles
   * from this row instead of blind-retrying a maybe-accepted request.
   */
  async function persistUncertainSubmit(input: {
    operationKey: string;
    endpointId: string;
    task: TaskName;
    startedAt: string;
    detail: string;
    ctx?: ProviderSubmitContext;
  }): Promise<void> {
    const ids = {
      jobId: input.ctx?.jobId ?? idsFromOperationKey(input.operationKey).jobId,
      attemptId: input.ctx?.attemptId ?? idsFromOperationKey(input.operationKey).attemptId,
    };
    await store.put({
      key: input.operationKey,
      operationId: `fal:${input.endpointId}:uncertain`,
      jobId: ids.jobId,
      attemptId: ids.attemptId,
      endpointId: input.endpointId,
      task: input.task,
      state: "SUBMITTED",
      requestId: null,
      statusUrl: null,
      responseUrl: null,
      attempts: 0,
      lastPolledAt: null,
      cancelState: null,
      redactedError: redactProviderText(input.detail),
      startedAt: input.startedAt,
      updatedAt: input.startedAt,
    });
  }

  async function queryOperation(operationId: string): Promise<ProviderOperationState> {
    const record = await store.getByOperationId(operationId);
    if (!record || !record.requestId || !record.statusUrl) return "UNKNOWN";
    const apiKey = requireKey();
    const { status, json } = await fetchOnce({
      url: record.statusUrl,
      method: "GET",
      headers: { authorization: `Key ${apiKey}` },
    });
    if (status === 404) return "UNKNOWN";
    if (status < 200 || status >= 300) {
      const row = (json ?? {}) as Record<string, unknown>;
      const detail = typeof row.detail === "string" ? row.detail : `status ${status}`;
      throw statusOf(status, detail);
    }
    const row = (json ?? {}) as Record<string, unknown>;
    const remote = typeof row.status === "string" ? row.status : "";
    const state: ProviderOperationState =
      remote === "COMPLETED" ? "SUCCEEDED" : remote === "FAILED" ? "FAILED" : remote === "CANCELED" ? "CANCELED" : "RUNNING";
    await store.update(operationId, { state, attempts: record.attempts + 1, lastPolledAt: nowIso() });
    return state;
  }

  return {
    adapterName: FAL_ADAPTER_NAME,
    adapterVersion: FAL_ADAPTER_VERSION,
    supportedTasks: FAL_SUPPORTED_TASKS,

    validate(task: TaskName): void {
      if (!FAL_SUPPORTED_TASKS.includes(task)) {
        throw new ProviderError("UNSUPPORTED_TASK", `fal-queue does not serve task ${task}.`);
      }
      // Parameter validation is spec-driven at submit (the endpoint id
      // selects the pinned schema); this gate only rejects unknown tasks.
    },

    estimateUsage(task: TaskName): UsageEstimate {
      if (!FAL_SUPPORTED_TASKS.includes(task)) {
        throw new ProviderError("UNSUPPORTED_TASK", `fal-queue does not serve task ${task}.`);
      }
      // Quotes flow through the economics price catalog (VERIFIED rows);
      // the adapter holds no price state, so it never invents a number.
      throw new ProviderError("PRICE_UNKNOWN", "fal-queue has no verified price; quote before admission.");
    },

    async submit(
      task: TaskName,
      parameters: Readonly<Record<string, unknown>>,
      operationKey: string,
      ctx?: ProviderSubmitContext,
    ): Promise<string> {
      if (!FAL_SUPPORTED_TASKS.includes(task)) {
        throw new ProviderError("UNSUPPORTED_TASK", `fal-queue does not serve task ${task}.`);
      }
      const endpointId = ctx?.endpointId?.trim() ? ctx.endpointId.trim() : null;
      if (!endpointId) {
        throw new ProviderError("INVALID_PARAMETERS", "fal-queue submit requires a pinned endpoint id.");
      }
      // Replay-by-key before any provider call: resubmits return the
      // durable operation id instead of double-submitting.
      const replay = await store.getByKey(operationKey);
      if (replay) return replay.operationId;

      const spec = await resolveSubmitSpec(endpointId, ctx);
      let request: { url: string; body: Readonly<Record<string, unknown>> };
      try {
        request = buildFalQueueRequest({ spec, task, parameters, webhookUrl: config.webhookUrl ?? null }, queueBaseUrl);
      } catch (error) {
        throw new ProviderError(
          "INVALID_PARAMETERS",
          error instanceof Error ? error.message : "fal-queue request is invalid.",
        );
      }
      const apiKey = requireKey();
      const startedAt = nowIso();
      let status: number;
      let json: unknown;
      try {
        ({ status, json } = await fetchOnce({
          url: request.url,
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Key ${apiKey}` },
          body: JSON.stringify(request.body),
        }));
      } catch (error) {
        // Transport died around the send: persist the uncertain submit,
        // then fail ambiguous so the worker reconciles — never resubmits.
        if (error instanceof ProviderError && error.code === "TRANSPORT" && error.retryable) {
          await persistUncertainSubmit({
            operationKey,
            endpointId,
            task,
            startedAt,
            detail: error.message,
            ctx,
          });
          throw new ProviderError("DISPATCH_UNCERTAIN", `fal submit is ambiguous for ${endpointId}; reconcile before retry.`, false);
        }
        throw error;
      }
      if (status >= 500) {
        // 5xx on submit is ambiguous (the queue may have accepted): never
        // a blind retry — persist first, reconcile later.
        const row = (json ?? {}) as Record<string, unknown>;
        const detail = typeof row.detail === "string" ? row.detail : `status ${status}`;
        await persistUncertainSubmit({ operationKey, endpointId, task, startedAt, detail, ctx });
        throw new ProviderError(
          "DISPATCH_UNCERTAIN",
          `fal submit is ambiguous for ${endpointId}: ${redactProviderText(detail)}; reconcile before retry.`,
          false,
        );
      }
      if (status < 200 || status >= 300) {
        const row = (json ?? {}) as Record<string, unknown>;
        const detail = typeof row.detail === "string" ? row.detail : typeof row.error === "string" ? row.error : `status ${status}`;
        throw statusOf(status, detail);
      }
      const row = (json ?? {}) as Record<string, unknown>;
      const requestId = typeof row.request_id === "string" ? row.request_id : null;
      if (!requestId) {
        // 2xx without a handle: accepted-but-unpollable is ambiguous too.
        await persistUncertainSubmit({
          operationKey,
          endpointId,
          task,
          startedAt,
          detail: `fal queue accepted ${endpointId} without a request id.`,
          ctx,
        });
        throw new ProviderError("DISPATCH_UNCERTAIN", `fal submit is ambiguous for ${endpointId}; reconcile before retry.`, false);
      }
      const operationId = `fal:${endpointId}:${requestId}`;
      const parsed = idsFromOperationKey(operationKey);
      const ids = { jobId: ctx?.jobId ?? parsed.jobId, attemptId: ctx?.attemptId ?? parsed.attemptId };
      const stamp = nowIso();
      const statusUrl =
        typeof row.status_url === "string" ? row.status_url : `${queueBaseUrl}/${endpointId}/requests/${requestId}/status`;
      const responseUrl =
        typeof row.response_url === "string" ? row.response_url : `${queueBaseUrl}/${endpointId}/requests/${requestId}`;
      assertQueueUrl(statusUrl, "status");
      assertQueueUrl(responseUrl, "response");
      await store.put({
        key: operationKey,
        operationId,
        jobId: ids.jobId,
        attemptId: ids.attemptId,
        endpointId,
        task,
        state: "SUBMITTED",
        requestId,
        statusUrl,
        responseUrl,
        attempts: 0,
        lastPolledAt: null,
        cancelState: null,
        redactedError: null,
        startedAt,
        updatedAt: stamp,
      });
      return operationId;
    },

    query: queryOperation,

    async reconcile(operationId: string, operationKey: string): Promise<ProviderOperationState> {
      const record = (await store.getByOperationId(operationId)) ?? (await store.getByKey(operationKey));
      if (!record) {
        throw new ProviderError("NOT_FOUND", `No fal operation for ${operationId}; nothing to reconcile.`);
      }
      // A persisted request id re-queries the authoritative status; a
      // never-confirmed submit stays UNKNOWN for the operator path.
      if (!record.requestId) return "UNKNOWN";
      return queryOperation(record.operationId);
    },

    async cancel(operationId: string): Promise<boolean> {
      const parsed = splitOperationId(operationId);
      if (!parsed) return false;
      const record = await store.getByOperationId(operationId);
      if (!record || !record.requestId) return false;
      if (record.state === "SUCCEEDED" || record.state === "FAILED" || record.state === "CANCELED") {
        await store.update(operationId, { cancelState: "not_cancellable" });
        return false;
      }
      const apiKey = requireKey();
      const { status } = await fetchOnce({
        url: `${queueBaseUrl}/${parsed.endpointId}/requests/${parsed.requestId}/cancel`,
        method: "PUT",
        headers: { authorization: `Key ${apiKey}` },
      });
      if (status === 404) {
        await store.update(operationId, { cancelState: "not_cancellable" });
        return false;
      }
      if (status < 200 || status >= 300) {
        return false;
      }
      await store.update(operationId, { state: "CANCELED", cancelState: "confirmed" });
      return true;
    },

    async retrieveOutputs(operationId: string): Promise<readonly ProviderOutputDescriptor[]> {
      const record = await store.getByOperationId(operationId);
      if (!record || !record.requestId || !record.responseUrl || !record.task) {
        throw new ProviderError("NOT_FOUND", `No completed fal operation for ${operationId}.`);
      }
      const apiKey = requireKey();
      const { status, json } = await fetchOnce({
        url: record.responseUrl,
        method: "GET",
        headers: { authorization: `Key ${apiKey}` },
      });
      if (status < 200 || status >= 300) {
        const row = (json ?? {}) as Record<string, unknown>;
        const detail = typeof row.detail === "string" ? row.detail : `status ${status}`;
        throw statusOf(status, detail);
      }
      try {
        const outputs = normalizeFalOutputs(record.task as TaskName, json, { allowInsecure: fixtureLane });
        for (const output of outputs) assertResultUrl(output.providerUrl);
        return outputs;
      } catch (error) {
        if (error instanceof ProviderError && error.code === "PROVIDER_FAILED") throw error;
        throw new ProviderError("PROVIDER_FAILED", error instanceof Error ? error.message : "fal result is unusable.");
      }
    },

    async reportUsage(operationId: string): Promise<ProviderUsageReport> {
      const record = await store.getByOperationId(operationId);
      if (!record || !record.requestId) {
        throw new ProviderError("NOT_FOUND", `No fal operation for ${operationId}.`);
      }
      // The queue reports no minor-unit usage; the actual consumption is
      // the request itself, and ICU actuals settle from the pinned quote.
      // providerMinor stays null — never an invented number. `task_unit`
      // is the generic meter the settlement validator accepts.
      const base = { meterUnit: "task_unit", meterQuantity: 1, redactedError: record.redactedError };
      const scripted = await readScriptedUsage(record.responseUrl);
      if (!scripted) return { ...base, providerMinorAmount: null };
      return { ...base, meterQuantity: scripted.quantity, providerMinorAmount: scripted.providerMinor };
    },
  };
}

/** Queue submit URL helper (tests pin the exact construction). */
export function falSubmitUrl(queueBaseUrl: string, endpointId: string): string {
  return queueUrlForEndpoint(queueBaseUrl, endpointId);
}
