import type { ResearchMode } from "./types";

// This cache is never a source of truth for run lifecycle, authorization, or
// recovery. It may contain only server-issued run IDs.
const KEY = "ethen:research:recent-runs";
const MAX_RUNS = 8;

export interface RecentRun {
  id: string;
  timestamp: number;
  mode: ResearchMode;
  /** Human-readable summary of the query or URL. */
  querySummary: string;
  /** One-line preview of the result. */
  resultPreview: string;
  /** Form values to restore (safe — no API keys or raw errors). */
  formSnapshot:
    | { mode: "search"; query: string }
    | { mode: "answer"; query: string }
    | { mode: "contents"; url: string };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getRuns(): RecentRun[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentRun[]) : [];
  } catch {
    return [];
  }
}

export function saveRun(run: RecentRun): void {
  if (!canUseStorage()) return;
  try {
    const existing = getRuns().filter((r) => r.id !== run.id);
    const next = [run, ...existing].slice(0, MAX_RUNS);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors silently.
  }
}

export function clearRuns(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}
