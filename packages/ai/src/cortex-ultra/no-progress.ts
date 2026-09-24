// ── Cortex Ultra No-Progress Loop Guard ──────────────────────────────────
// Detects repeated fingerprints to prevent infinite loops.
// Deterministic fingerprint excludes volatile fields (timestamps, random IDs).

export interface NoProgressFingerprintInput {
  role?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  resultSummary?: string;
  evidenceIds?: string[];
  verifierFailure?: string;
}

export interface NoProgressTrackerState {
  fingerprints: Map<string, number>;
  threshold: number;
  blocked: boolean;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      const sorted = [...value].sort();
      return `[${sorted.map(stableStringify).join(",")}]`;
    }
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map((k) => `${k}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${pairs.join(",")}}`;
  }
  return String(value);
}

export function createNoProgressFingerprint(input: NoProgressFingerprintInput): string {
  const normalized: Record<string, string> = {
    role: input.role ?? "",
    toolName: input.toolName ?? "",
    args: stableStringify(input.args ?? {}),
    resultSummary: (input.resultSummary ?? "").slice(0, 200),
    evidenceIds: (input.evidenceIds ?? []).sort().join(","),
    verifierFailure: input.verifierFailure ?? "",
  };
  return stableStringify(normalized);
}

export function createNoProgressTracker(threshold?: number): NoProgressTrackerState {
  return {
    fingerprints: new Map(),
    threshold: threshold ?? 3,
    blocked: false,
  };
}

export function recordNoProgressObservation(
  tracker: NoProgressTrackerState,
  fingerprint: string
): void {
  if (tracker.blocked) return;
  const count = (tracker.fingerprints.get(fingerprint) ?? 0) + 1;
  tracker.fingerprints.set(fingerprint, count);
  if (count >= tracker.threshold) {
    tracker.blocked = true;
  }
}

export function shouldAbortForNoProgress(
  tracker: NoProgressTrackerState
): boolean {
  return tracker.blocked;
}
