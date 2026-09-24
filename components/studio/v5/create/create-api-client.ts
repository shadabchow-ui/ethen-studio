/**
 * STUDIO_09 — typed V1 create API client (pure response parsing).
 *
 * Consumes the STUDIO_04/05/06 adapters: catalog resolve, estimate,
 * job admission, and job polling. Fetch failures and error envelopes
 * are typed states — never empty success, never fabricated jobs.
 */

import type { StudioDataState } from "../shell/types";

export type CreateApiState = StudioDataState | "reconciling";

export interface CreateApiError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface RouteDecisionView {
  endpointId: string;
  mode: "auto" | "explicit";
  selectedReason: string;
  excluded: readonly { endpointId: string; reason: string; detail: string }[];
  priceVersion: string;
  meterUnit: string;
  meterQuantity: number;
}

export interface QuoteView {
  quoteId: string;
  task: string;
  endpointId: string;
  estimatedIcu: number;
  capIcu: number | null;
  hardCap: boolean;
  meterUnit: string;
  meterQuantity: number;
  priceVersion: string;
  expiresAt: string;
}

export interface AdmittedJobView {
  jobId: string;
  task: string;
  status: string;
  statusLabel: string;
  idempotencyKey: string;
  quoteId: string;
  endpointId: string;
  replayed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolledJobView extends AdmittedJobView {
  reservationId: string | null;
  cancelReason: string | null;
  retryable: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function parseApiError(body: unknown, fallback: string): CreateApiError {
  const error = asRecord(asRecord(body).error);
  const code = asString(error.code) ?? "UNKNOWN";
  const message = asString(error.message) ?? fallback;
  return {
    code,
    message,
    retryable: !["VALIDATION_ERROR", "NOT_FOUND", "FORBIDDEN", "UNAUTHORIZED", "SETUP_REQUIRED", "CONFLICT", "NO_QUALIFIED_ROUTE"].includes(code),
  };
}

export function stateForErrorCode(code: string): StudioDataState {
  if (code === "SETUP_REQUIRED") return "setup";
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return "permission";
  return "error";
}

export function parseRouteDecision(body: unknown): { decision: RouteDecisionView | null; error: CreateApiError | null } {
  const envelope = asRecord(body);
  if (envelope.ok === false) return { decision: null, error: parseApiError(body, "Model routing failed.") };
  const data = asRecord(envelope.data);
  // P01 local-lane honest no-route: the router ran and qualified nothing.
  // An explicitly null decision carries the recorded reason; a missing
  // decision key stays a malformed-response error as before.
  if ("decision" in data && (data.decision === null || data.decision === undefined)) {
    const reason = asString(data.reason) ?? "No qualified route for this request.";
    return { decision: null, error: { code: "NO_QUALIFIED_ROUTE", message: reason, retryable: false } };
  }
  const decision = asRecord(data.decision);
  const endpointId = asString(decision.endpointId);
  if (!endpointId) return { decision: null, error: { code: "UNKNOWN", message: "Router returned no endpoint.", retryable: true } };
  const rationale = asRecord(decision.rationale);
  const quoteInputs = asRecord(decision.quoteInputs);
  const excluded = Array.isArray(decision.excluded)
    ? decision.excluded.map((entry) => {
        const record = asRecord(entry);
        return {
          endpointId: asString(record.endpointId) ?? "unknown",
          reason: asString(record.reason) ?? "UNKNOWN",
          detail: asString(record.detail) ?? "",
        };
      })
    : [];
  return {
    decision: {
      endpointId,
      mode: decision.mode === "explicit" ? "explicit" : "auto",
      selectedReason: asString(rationale.selectedReason) ?? "Selected by deterministic routing.",
      excluded,
      priceVersion: asString(quoteInputs.priceVersion) ?? "",
      meterUnit: asString(quoteInputs.meterUnit) ?? "task_unit",
      meterQuantity: asInt(quoteInputs.meterQuantity) ?? 1,
    },
    error: null,
  };
}

export function parseQuote(body: unknown): { quote: QuoteView | null; error: CreateApiError | null } {
  const envelope = asRecord(body);
  if (envelope.ok === false) return { quote: null, error: parseApiError(body, "Estimate failed.") };
  const quote = asRecord(asRecord(envelope.data).quote);
  const quoteId = asString(quote.quoteId);
  const endpointId = asString(quote.endpointId);
  const estimatedIcu = asInt(quote.estimatedCostIcu);
  const expiresAt = asString(quote.expiresAt);
  if (!quoteId || !endpointId || estimatedIcu === null || !expiresAt) {
    return { quote: null, error: { code: "UNKNOWN", message: "Estimate returned an incomplete quote.", retryable: true } };
  }
  const capRaw = quote.capIcu;
  return {
    quote: {
      quoteId,
      task: asString(quote.task) ?? "",
      endpointId,
      estimatedIcu,
      capIcu: capRaw === null || capRaw === undefined ? null : (asInt(capRaw) ?? null),
      hardCap: quote.hardCap !== false,
      meterUnit: asString(quote.meterUnit) ?? "task_unit",
      meterQuantity: asInt(quote.meterQuantity) ?? 1,
      priceVersion: asString(quote.priceVersion) ?? "",
      expiresAt,
    },
    error: null,
  };
}

function parseJobRecord(record: Record<string, unknown>): PolledJobView | null {
  const jobId = asString(record.jobId);
  const task = asString(record.task);
  const status = asString(record.status);
  if (!jobId || !task || !status) return null;
  return {
    jobId,
    task,
    status,
    statusLabel: asString(record.statusLabel) ?? status,
    idempotencyKey: asString(record.idempotencyKey) ?? "",
    quoteId: asString(record.quoteId) ?? "",
    endpointId: asString(record.endpointId) ?? "",
    replayed: record.replayed === true,
    reservationId: asString(record.reservationId),
    cancelReason: asString(record.cancelReason),
    retryable: status === "FAILED" || status === "RECONCILING",
    createdAt: asString(record.createdAt) ?? "",
    updatedAt: asString(record.updatedAt) ?? "",
  };
}

export function parseAdmittedJob(body: unknown): { job: PolledJobView | null; error: CreateApiError | null } {
  const envelope = asRecord(body);
  if (envelope.ok === false) return { job: null, error: parseApiError(body, "Job admission failed.") };
  const job = parseJobRecord(asRecord(asRecord(envelope.data).job));
  if (!job) {
    return { job: null, error: { code: "UNKNOWN", message: "Admission returned no job.", retryable: true } };
  }
  return { job, error: null };
}

export function parsePolledJob(body: unknown): { job: PolledJobView | null; error: CreateApiError | null } {
  const envelope = asRecord(body);
  if (envelope.ok === false) return { job: null, error: parseApiError(body, "Job read failed.") };
  const job = parseJobRecord(asRecord(asRecord(envelope.data).job));
  if (!job) {
    return { job: null, error: { code: "UNKNOWN", message: "Job read returned no job.", retryable: true } };
  }
  return { job, error: null };
}

export interface EndpointSpecView {
  endpointId: string;
  label: string;
  task: string;
  schemaVersion: string;
  jsonSchema: Readonly<Record<string, unknown>>;
  requiredControls: readonly string[];
  supportedControls: readonly string[];
  rawParams: Readonly<Record<string, string>>;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function parseEndpointSpec(body: unknown): { spec: EndpointSpecView | null; error: CreateApiError | null } {
  const envelope = asRecord(body);
  if (envelope.ok === false) return { spec: null, error: parseApiError(body, "Endpoint detail failed.") };
  const endpoint = asRecord(asRecord(envelope.data).endpoint);
  const endpointId = asString(endpoint.endpointId);
  if (!endpointId) {
    return { spec: null, error: { code: "UNKNOWN", message: "Catalog returned no endpoint.", retryable: true } };
  }
  return {
    spec: {
      endpointId,
      label: asString(endpoint.label) ?? endpointId,
      task: asString(endpoint.task) ?? "",
      schemaVersion: asString(endpoint.schemaVersion) ?? "",
      jsonSchema: asRecord(endpoint.jsonSchema),
      requiredControls: asStringArray(endpoint.requiredControls),
      supportedControls: asStringArray(endpoint.supportedControls),
      rawParams: asRecord(endpoint.rawParams) as Readonly<Record<string, string>>,
    },
    error: null,
  };
}

const TERMINAL_JOB_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"]);

export function isTerminalJobStatus(status: string): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

/** Format integer ICU as dollars without floating-point money. */
export function formatIcuDollars(icu: number): string {
  const negative = icu < 0;
  const abs = Math.abs(Math.trunc(icu));
  const dollars = Math.floor(abs / 1000);
  const mills = String(abs % 1000).padStart(3, "0");
  return `${negative ? "-" : ""}$${dollars.toLocaleString("en-US")}.${mills}`;
}
