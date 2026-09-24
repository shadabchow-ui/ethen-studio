// ── Generation Log Export Foundation ──────────────────────────────────────────
// Builds exportable log records for media generation activity. Designed for
// JSON download only in beta — no admin dashboard, no analytics database.
// Includes job ID, provider job ID, app/tool IDs, timestamp, provider/model,
// parameters, estimate/charge/refund state, asset IDs, and trace ID.
//
// Does NOT include raw prompt text if a hash reference is used.
// Does NOT include secrets or sensitive env values.
// Does NOT collect PII beyond what the job already stores.

import type { MediaJob } from "./types";
import { getLedgerEntryByJob } from "./usage-ledger";
import { getTracesByJob } from "./traces";

export interface GenerationLogEntry {
  jobId: string;
  providerJobId?: string | null;
  appId?: string | null;
  toolId?: string | null;
  timestamp: string;
  providerId?: string | null;
  modelId?: string | null;
  modality?: string | null;
  mode?: string | null;
  capability?: string | null;
  promptHash?: string | null;
  promptReference?: string | null;
  parameters?: Record<string, unknown> | null;
  estimatedCredits: number | null;
  chargedCredits: number | null;
  settlementStatus: string | null;
  assetIds: string[];
  traceId?: string | null;
  status: string;
  error?: string | null;
  completedAt?: string | null;
  creditConfidence: "exact" | "estimated" | "unknown" | null;
  usable?: boolean | null;
  waste?: boolean | null;
}

export interface GenerationLogExport {
  exportedAt: string;
  exportType: "generation_log_v1_beta";
  totalEntries: number;
  entries: GenerationLogEntry[];
  disclaimer: string;
}

const EXPORT_DISCLAIMER =
  "Beta generation log — not a full legal record, not a billing receipt. " +
  "Credit values are estimates. Export type: generation_log_v1_beta.";

export function buildGenerationLogEntry(
  job: MediaJob,
  _appId?: string | null,
): GenerationLogEntry {
  const ledgerEntry = getLedgerEntryByJob(job.id);
  const traces = getTracesByJob(job.id);
  const trace = traces.length > 0 ? traces[0] : null;

  return {
    jobId: job.id,
    providerJobId: job.providerJobId ?? null,
    appId: _appId ?? null,
    toolId: job.toolId ?? null,
    timestamp: job.createdAt,
    providerId: job.providerId ?? null,
    modelId: job.modelId ?? null,
    modality: job.modality ?? null,
    mode: job.mode ?? null,
    capability: job.capability ?? null,
    promptHash: trace?.promptHash ?? null,
    promptReference: trace?.promptReference ?? null,
    parameters: trace?.parameters ?? {
      config: job.config,
      params: job.params,
    },
    estimatedCredits: job.estimatedCredits ?? ledgerEntry?.estimatedCredits ?? null,
    chargedCredits: ledgerEntry?.chargedCredits ?? job.chargedCredits ?? null,
    settlementStatus: ledgerEntry?.settlementStatus ?? job.creditSettlementStatus ?? null,
    assetIds: job.assetId ? [job.assetId] : (trace?.outputAssetIds ?? []),
    traceId: trace?.id ?? job.traceId ?? null,
    status: job.status ?? job.state,
    error: typeof job.error === "string" ? job.error : job.error?.message ?? null,
    completedAt: job.completedAt ?? null,
    creditConfidence: (job.creditEstimateConfidence ?? (ledgerEntry ? "estimated" : "unknown")),
    usable: job.usable ?? null,
    waste: job.waste ?? null,
  };
}

export function buildGenerationLogExport(
  jobs: MediaJob[],
  _appId?: string | null,
): GenerationLogExport {
  const entries = jobs.map((job) => buildGenerationLogEntry(job, _appId));
  return {
    exportedAt: new Date().toISOString(),
    exportType: "generation_log_v1_beta",
    totalEntries: entries.length,
    entries,
    disclaimer: EXPORT_DISCLAIMER,
  };
}

export function formatLogExportJson(exportData: GenerationLogExport): string {
  return JSON.stringify(exportData, null, 2);
}

export function downloadLogExport(exportData: GenerationLogExport, filename?: string): void {
  if (typeof window === "undefined") return;

  const json = formatLogExportJson(exportData);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `ethen-generation-log-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
