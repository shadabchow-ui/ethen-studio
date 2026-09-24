/**
 * STUDIO_09 — durable create history hook.
 *
 * Project-scoped history persisted in localStorage and revalidated
 * against the V1 job API, so statuses stay truthful across reloads.
 * Drafts are never history: only admitted jobs are stored.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  appendHistory,
  isHistoryRetryable,
  loadHistory,
  localStorageHistory,
  updateHistoryEntry,
  type CreateHistoryEntry,
  type HistoryStorage,
} from "./history-model";
import { parsePolledJob } from "./create-api-client";

export interface UseCreateHistoryResult {
  entries: readonly CreateHistoryEntry[];
  record: (entry: CreateHistoryEntry) => void;
  refresh: () => void;
  retryableEntries: readonly CreateHistoryEntry[];
}

const memoryStorage = (): HistoryStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

export function useCreateHistory(projectId: string | null, toolId: string): UseCreateHistoryResult {
  const [storage] = useState<HistoryStorage>(() => localStorageHistory() ?? memoryStorage());
  const [nonce, setNonce] = useState(0);

  // Entries derive from storage on every scope/nonce change — no
  // synchronous setState in effects. record()/refresh() bump the nonce.
  const entries = useMemo(() => {
    // Nonce read: record()/refresh() bump it to recompute from storage.
    void nonce;
    return projectId ? loadHistory(storage, projectId, toolId) : [];
  }, [storage, projectId, toolId, nonce]);

  // Revalidate stored statuses against job truth on mount/scope change.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const stored = loadHistory(storage, projectId, toolId);
    const open = stored.filter((entry) => !["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(entry.status));
    if (open.length === 0) return;
    void (async () => {
      for (const entry of open) {
        try {
          const response = await fetch(
            `/api/studio/v1/jobs/${encodeURIComponent(entry.jobId)}?projectId=${encodeURIComponent(projectId)}`,
            { cache: "no-store" },
          );
          const parsed = parsePolledJob(await response.json().catch(() => null));
          if (cancelled || parsed.error || !parsed.job) continue;
          updateHistoryEntry(storage, projectId, toolId, entry.jobId, {
            status: parsed.job.status,
            statusLabel: parsed.job.statusLabel,
            retryable: parsed.job.retryable,
            updatedAt: parsed.job.updatedAt,
          });
        } catch {
          // Keep the stored snapshot; refresh() retries explicitly.
        }
      }
      if (!cancelled) setNonce((value) => value + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [storage, projectId, toolId]);

  const record = useCallback(
    (entry: CreateHistoryEntry) => {
      if (!projectId) return;
      appendHistory(storage, projectId, toolId, entry);
      setNonce((value) => value + 1);
    },
    [storage, projectId, toolId],
  );

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return {
    entries,
    record,
    refresh,
    retryableEntries: entries.filter((entry) => isHistoryRetryable(entry)),
  };
}
