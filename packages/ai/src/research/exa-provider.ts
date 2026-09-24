import "server-only";

import type { SearchFormState, AnswerFormState, ContentsFormState, SearchResult, AnswerResult, ContentsResult } from "./types";
import { normalizeExaSearchResult, normalizeExaAnswerResult, normalizeExaContentsResult } from "./normalize";

const EXA_BASE = "https://api.exa.ai";
const DEFAULT_TIMEOUT_MS = 12_000;

export type ExaFailureKind = "timeout" | "aborted" | "network" | "authentication" | "rate_limited" | "provider" | "invalid_response";

export interface ExaProviderReceipt {
  provider: "exa";
  endpoint: "/search" | "/answer" | "/contents";
  status: number | null;
  latencyMs: number;
  requestId: string | null;
  /** Exa does not document a response usage schema for these endpoints; never infer costs. */
  usage: null;
  cost: null;
}

export interface ExaCall<T> { data: T; receipt: ExaProviderReceipt }
export interface ExaTransportOptions { signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch }

function headers(apiKey: string): HeadersInit { return { "Content-Type": "application/json", "x-api-key": apiKey }; }

function classifyStatus(status: number): ExaFailureKind {
  if (status === 401 || status === 403) return "authentication";
  if (status === 429) return "rate_limited";
  return "provider";
}

/** A redacted error safe for route traces; never includes provider response bodies or credentials. */
export class ExaProviderError extends Error {
  constructor(public readonly kind: ExaFailureKind, public readonly status: number | null, public readonly receipt: ExaProviderReceipt) {
    super(kind === "authentication" ? "Exa authentication failed." : kind === "timeout" ? "Exa request timed out." : kind === "aborted" ? "Exa request was cancelled." : "Exa provider request failed.");
    this.name = "ExaProviderError";
  }
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  return { signal: controller.signal, cleanup: () => { clearTimeout(timeout); signal?.removeEventListener("abort", abort); } };
}

async function exaFetch(apiKey: string, endpoint: ExaProviderReceipt["endpoint"], body: Record<string, unknown>, options: ExaTransportOptions = {}): Promise<ExaCall<Record<string, unknown>>> {
  const started = Date.now();
  const { signal, cleanup } = combinedSignal(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response | undefined;
  const receipt = (status: number | null, requestId: string | null): ExaProviderReceipt => ({ provider: "exa", endpoint, status, latencyMs: Date.now() - started, requestId, usage: null, cost: null });
  try {
    // POSTs may be billable and lack an idempotency contract, so they intentionally never retry.
    response = await (options.fetchImpl ?? fetch)(`${EXA_BASE}${endpoint}`, { method: "POST", headers: headers(apiKey), body: JSON.stringify(body), signal });
    const providerReceipt = receipt(response.status, response.headers.get("x-request-id") ?? response.headers.get("request-id"));
    if (!response.ok) throw new ExaProviderError(classifyStatus(response.status), response.status, providerReceipt);
    try { return { data: await response.json() as Record<string, unknown>, receipt: providerReceipt }; }
    catch { throw new ExaProviderError("invalid_response", response.status, providerReceipt); }
  } catch (error) {
    if (error instanceof ExaProviderError) throw error;
    const providerReceipt = receipt(response?.status ?? null, response?.headers.get("x-request-id") ?? null);
    if (options.signal?.aborted) throw new ExaProviderError("aborted", null, providerReceipt);
    if (signal.aborted) throw new ExaProviderError("timeout", null, providerReceipt);
    throw new ExaProviderError("network", null, providerReceipt);
  } finally { cleanup(); }
}

export async function exaSearchWithReceipt(apiKey: string, form: SearchFormState, options?: ExaTransportOptions): Promise<ExaCall<SearchResult[]>> {
  const contents: Record<string, unknown> = {}; if (form.highlights) contents.highlights = true; if (form.fullText) contents.text = true;
  const body: Record<string, unknown> = { query: form.query, numResults: form.numResults, type: mapSearchType(form.searchType) };
  if (form.category !== "general") body.category = form.category; if (Object.keys(contents).length) body.contents = contents;
  const call = await exaFetch(apiKey, "/search", body, options);
  return { data: (Array.isArray(call.data.results) ? call.data.results : []).map((r) => normalizeExaSearchResult(r as Record<string, unknown>)), receipt: call.receipt };
}
export async function exaAnswerWithReceipt(apiKey: string, form: AnswerFormState, options?: ExaTransportOptions): Promise<ExaCall<AnswerResult>> {
  const body: Record<string, unknown> = { query: form.query, text: form.text }; if (form.systemPrompt.trim()) body.systemPrompt = form.systemPrompt.trim();
  const call = await exaFetch(apiKey, "/answer", body, options); return { data: normalizeExaAnswerResult(call.data), receipt: call.receipt };
}
export async function exaContentsWithReceipt(apiKey: string, form: ContentsFormState, options?: ExaTransportOptions): Promise<ExaCall<ContentsResult>> {
  const url = form.url.trim(); const body: Record<string, unknown> = { urls: [url], text: { maxCharacters: form.maxCharacters, includeHtmlTags: false } }; if (form.highlights) body.highlights = true;
  const call = await exaFetch(apiKey, "/contents", body, options); const first = (Array.isArray(call.data.results) ? call.data.results[0] : {}) as Record<string, unknown>;
  return { data: normalizeExaContentsResult({ ...first, url }), receipt: call.receipt };
}
export async function exaSearch(apiKey: string, form: SearchFormState, options?: ExaTransportOptions) { return (await exaSearchWithReceipt(apiKey, form, options)).data; }
export async function exaAnswer(apiKey: string, form: AnswerFormState, options?: ExaTransportOptions) { return (await exaAnswerWithReceipt(apiKey, form, options)).data; }
export async function exaContents(apiKey: string, form: ContentsFormState, options?: ExaTransportOptions) { return (await exaContentsWithReceipt(apiKey, form, options)).data; }

function mapSearchType(type: SearchFormState["searchType"]): string { return type === "instant" || type === "fast" ? "keyword" : type === "deep" ? "neural" : "auto"; }
