import type { AgentRun, AgentAction, AgentEvidence } from "./types";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

const STORE_DIR = join(process.cwd(), ".local", "ethen-runtime-store");

function ensureDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function pathFor(name: string): string {
  return join(STORE_DIR, name);
}

function readJsonArray<T>(name: string): T[] {
  const p = pathFor(name);
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as T[];
  } catch {
    console.warn(`[runtime-storage] Malformed store "${name}", starting fresh.`);
    return [];
  }
}

function writeJsonAtomic(name: string, data: unknown): void {
  ensureDir();
  const p = pathFor(name);
  const tmp = p + ".tmp." + Date.now();
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmp, p);
  } catch {
    try { unlinkSync(tmp); } catch { /* best effort */ }
  }
}

const RUNS_FILE = "agent_runs.json";
const ACTIONS_FILE = "agent_actions.json";
const EVIDENCE_FILE = "agent_evidence.json";

export function loadRuns(): AgentRun[] {
  return readJsonArray<AgentRun>(RUNS_FILE);
}

export function saveRuns(runs: AgentRun[]): void {
  writeJsonAtomic(RUNS_FILE, runs);
}

export function loadActions(): AgentAction[] {
  return readJsonArray<AgentAction>(ACTIONS_FILE);
}

export function saveActions(actions: AgentAction[]): void {
  writeJsonAtomic(ACTIONS_FILE, actions);
}

export function loadEvidence(): AgentEvidence[] {
  return readJsonArray<AgentEvidence>(EVIDENCE_FILE);
}

export function saveEvidence(evidence: AgentEvidence[]): void {
  writeJsonAtomic(EVIDENCE_FILE, evidence);
}

export function persistRun(run: AgentRun): void {
  try {
    const all = loadRuns();
    const idx = all.findIndex((r) => r.id === run.id);
    if (idx >= 0) {
      all[idx] = run;
    } else {
      all.unshift(run);
    }
    saveRuns(all);
  } catch (err) {
    console.error("[runtime-storage] persistRun failed:", err);
  }
}

export function persistRunStatus(
  id: string,
  status: string,
  updatedAt: string,
  startedAt?: string | null,
  completedAt?: string | null,
): void {
  try {
    const all = loadRuns();
    const idx = all.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const updated = { ...all[idx], status, updatedAt } as AgentRun;
    if (startedAt !== undefined) updated.startedAt = startedAt;
    if (completedAt !== undefined) updated.completedAt = completedAt;
    all[idx] = updated;
    saveRuns(all);
  } catch (err) {
    console.error("[runtime-storage] persistRunStatus failed:", err);
  }
}

export function persistRunOutput(id: string, output: Record<string, unknown>): void {
  try {
    const all = loadRuns();
    const idx = all.findIndex((r) => r.id === id);
    if (idx < 0) return;
    all[idx] = { ...all[idx], output, updatedAt: new Date().toISOString() };
    saveRuns(all);
  } catch (err) {
    console.error("[runtime-storage] persistRunOutput failed:", err);
  }
}

export function persistAction(action: AgentAction): void {
  try {
    const all = loadActions();
    const idx = all.findIndex((a) => a.id === action.id);
    if (idx >= 0) {
      all[idx] = action;
    } else {
      all.push(action);
    }
    saveActions(all);
  } catch (err) {
    console.error("[runtime-storage] persistAction failed:", err);
  }
}

export function persistActionStatus(
  id: string,
  status: string,
  startedAt?: string | null,
  completedAt?: string | null,
): void {
  try {
    const all = loadActions();
    const idx = all.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const updated = { ...all[idx], status } as AgentAction;
    if (startedAt !== undefined) updated.startedAt = startedAt;
    if (completedAt !== undefined) updated.completedAt = completedAt;
    all[idx] = updated;
    saveActions(all);
  } catch (err) {
    console.error("[runtime-storage] persistActionStatus failed:", err);
  }
}

export function persistActionOutput(id: string, output: Record<string, unknown>): void {
  try {
    const all = loadActions();
    const idx = all.findIndex((a) => a.id === id);
    if (idx < 0) return;
    all[idx] = { ...all[idx], output };
    saveActions(all);
  } catch (err) {
    console.error("[runtime-storage] persistActionOutput failed:", err);
  }
}

export function persistEvidence(evidence: AgentEvidence): void {
  try {
    const all = loadEvidence();
    all.push(evidence);
    saveEvidence(all);
  } catch (err) {
    console.error("[runtime-storage] persistEvidence failed:", err);
  }
}

export function loadLocalRuns(): AgentRun[] {
  return loadRuns();
}

export function loadLocalActions(): AgentAction[] {
  return loadActions();
}

export function loadLocalEvidence(): AgentEvidence[] {
  return loadEvidence();
}

export function loadLocalActionsForRun(runId: string): AgentAction[] {
  return loadActions()
    .filter((a) => a.runId === runId)
    .sort((a, b) => a.step - b.step);
}

export function loadLocalEvidenceForRun(runId: string): AgentEvidence[] {
  return loadEvidence()
    .filter((e) => e.runId === runId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function loadLocalRunByIdempotencyKey(key: string): AgentRun | null {
  return loadRuns().find((r) => r.idempotencyKey === key) ?? null;
}

export function loadLocalRun(id: string): AgentRun | null {
  return loadRuns().find((r) => r.id === id) ?? null;
}

export const RUNTIME_LOCAL_FS_DURABILITY_LABEL = "Local file storage (private-beta durable)";
export const RUNTIME_LOCAL_FS_DURABILITY_DESCRIPTION =
  "Run data is persisted to local disk in .local/ethen-runtime-store/ and survives server restarts. " +
  "This is private-beta storage — not production database persistence.";
