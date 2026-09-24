/**
 * STUDIO_09 — durable create history model (pure + storage helpers).
 *
 * History entries are keyed by admitted jobId: a mutable draft is never
 * persisted as a completed generation. Drafts live under a separate key
 * and never appear in history until admission returns a job. Storage is
 * injected so tests run without a DOM.
 */

import type { CreateJobResultView } from "./types";

export interface CreateHistoryEntry extends CreateJobResultView {
  projectId: string;
  idempotencyKey: string;
  paramsHash: string;
}

export interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const HISTORY_KEY_PREFIX = "ethen.studio.create-history.v1";
const DRAFT_KEY_PREFIX = "ethen.studio.create-draft.v1";
const MAX_ENTRIES = 50;

export function historyKeyFor(projectId: string, toolId: string): string {
  return `${HISTORY_KEY_PREFIX}:${projectId}:${toolId}`;
}

export function draftKeyFor(projectId: string, toolId: string): string {
  return `${DRAFT_KEY_PREFIX}:${projectId}:${toolId}`;
}

function parseEntries(raw: string | null): CreateHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CreateHistoryEntry =>
        typeof entry === "object" && entry !== null && typeof (entry as { jobId?: unknown }).jobId === "string",
    );
  } catch {
    return [];
  }
}

export function loadHistory(storage: HistoryStorage, projectId: string, toolId: string): CreateHistoryEntry[] {
  return parseEntries(storage.getItem(historyKeyFor(projectId, toolId)));
}

/** Append an admitted generation; drafts (no jobId) are rejected. */
export function appendHistory(
  storage: HistoryStorage,
  projectId: string,
  toolId: string,
  entry: CreateHistoryEntry,
): CreateHistoryEntry[] {
  if (!entry.jobId.trim()) {
    throw new Error("History entries require an admitted jobId; drafts are never history.");
  }
  const entries = [entry, ...loadHistory(storage, projectId, toolId).filter((item) => item.jobId !== entry.jobId)].slice(
    0,
    MAX_ENTRIES,
  );
  storage.setItem(historyKeyFor(projectId, toolId), JSON.stringify(entries));
  return entries;
}

export function updateHistoryEntry(
  storage: HistoryStorage,
  projectId: string,
  toolId: string,
  jobId: string,
  patch: Partial<CreateHistoryEntry>,
): CreateHistoryEntry[] {
  const entries = loadHistory(storage, projectId, toolId).map((entry) =>
    entry.jobId === jobId ? { ...entry, ...patch, jobId } : entry,
  );
  storage.setItem(historyKeyFor(projectId, toolId), JSON.stringify(entries));
  return entries;
}

const RETRYABLE_STATUSES = new Set(["FAILED", "CANCELLED", "EXPIRED", "RECONCILING"]);

/** A history entry is retryable from terminal/uncertain states only. */
export function isHistoryRetryable(entry: Pick<CreateHistoryEntry, "status" | "retryable">): boolean {
  return entry.retryable === true && RETRYABLE_STATUSES.has(entry.status);
}

export function localStorageHistory(): HistoryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
