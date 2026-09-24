import { createHash } from "node:crypto";
import type { ComputerUseStorageAdapter } from "./storage";

export type ComputerUseLegacyRecordKind =
  | "run"
  | "step"
  | "screenshot"
  | "approval"
  | "artifact"
  | "observation"
  | "event";

export interface ComputerUseMigrationRecord {
  key: string;
  kind: ComputerUseLegacyRecordKind;
  runId: string;
  projectId: string;
  payload: Readonly<Record<string, unknown>>;
  contentHash: string;
}

export interface ComputerUseMigrationCheckpoint {
  sourceDigest: string;
  cursor: number;
  migratedKeys: string[];
}

export interface ComputerUseMigrationTarget {
  upsert(record: ComputerUseMigrationRecord): Promise<void>;
  remove(key: string, projectId: string): Promise<void>;
  hashFor(key: string, projectId: string): Promise<string | null>;
}

export interface ComputerUseMigrationResult {
  dryRun: boolean;
  sourceCount: number;
  migratedCount: number;
  verifiedCount: number;
  sourceDigest: string;
  checkpoint: ComputerUseMigrationCheckpoint;
  compatibilityMetrics: {
    countParity: boolean;
    hashParity: boolean;
    deletionReady: boolean;
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export async function snapshotLegacyComputerUse(
  source: ComputerUseStorageAdapter,
  projectForRun: (runId: string) => string,
): Promise<ComputerUseMigrationRecord[]> {
  const records: ComputerUseMigrationRecord[] = [];
  const runs = await source.runs.list();
  for (const run of runs.sort((left, right) => left.id.localeCompare(right.id))) {
    const projectId = projectForRun(run.id);
    if (!projectId.trim()) throw new Error(`No project mapping exists for run ${run.id}.`);
    const collections: Array<[ComputerUseLegacyRecordKind, ReadonlyArray<{ id?: string; runId?: string }>]> = [
      ["run", [run]],
      ["step", await source.steps.getByRun(run.id)],
      ["screenshot", await source.screenshots.getByRun(run.id)],
      ["approval", await source.approvals.getByRun(run.id)],
      ["artifact", await source.artifacts.getByRun(run.id)],
      ["observation", await source.observations.getByRun(run.id)],
      ["event", await source.events.getByRun(run.id)],
    ];
    for (const [kind, items] of collections) {
      for (const [index, item] of items.entries()) {
        const payload = structuredClone(item) as Record<string, unknown>;
        const id = item.id ?? `${run.id}-${kind}-${index + 1}`;
        records.push({
          key: `${kind}:${id}`,
          kind,
          runId: run.id,
          projectId,
          payload,
          contentHash: hash(payload),
        });
      }
    }
  }
  return records.sort((left, right) => left.key.localeCompare(right.key));
}

export async function migrateComputerUseRecords(input: {
  records: ComputerUseMigrationRecord[];
  target: ComputerUseMigrationTarget;
  dryRun: boolean;
  batchSize?: number;
  checkpoint?: ComputerUseMigrationCheckpoint;
}): Promise<ComputerUseMigrationResult> {
  const sourceDigest = hash(input.records.map((record) => [record.key, record.contentHash]));
  const checkpoint = input.checkpoint ?? { sourceDigest, cursor: 0, migratedKeys: [] };
  if (checkpoint.sourceDigest !== sourceDigest) {
    throw new Error("Migration source changed after checkpoint creation.");
  }
  const batchSize = Math.max(1, input.batchSize ?? (input.records.length || 1));
  const end = input.dryRun
    ? input.records.length
    : Math.min(input.records.length, checkpoint.cursor + batchSize);
  const migratedKeys = [...checkpoint.migratedKeys];
  let verifiedCount = 0;

  for (let index = checkpoint.cursor; index < end; index += 1) {
    const record = input.records[index];
    if (!input.dryRun) {
      await input.target.upsert(record);
      if (!migratedKeys.includes(record.key)) migratedKeys.push(record.key);
    }
    const persistedHash = input.dryRun
      ? record.contentHash
      : await input.target.hashFor(record.key, record.projectId);
    if (persistedHash !== record.contentHash) {
      throw new Error(`Migration hash mismatch for ${record.key}.`);
    }
    verifiedCount += 1;
  }

  const nextCheckpoint = {
    sourceDigest,
    cursor: end,
    migratedKeys,
  };
  const complete = end === input.records.length;
  const countParity = complete && (input.dryRun || migratedKeys.length === input.records.length);
  const hashParity = complete && verifiedCount === end - checkpoint.cursor;
  return {
    dryRun: input.dryRun,
    sourceCount: input.records.length,
    migratedCount: input.dryRun ? 0 : migratedKeys.length,
    verifiedCount,
    sourceDigest,
    checkpoint: nextCheckpoint,
    compatibilityMetrics: {
      countParity,
      hashParity,
      deletionReady: !input.dryRun && countParity && hashParity,
    },
  };
}

export async function rollbackComputerUseMigration(
  target: ComputerUseMigrationTarget,
  records: ComputerUseMigrationRecord[],
  checkpoint: ComputerUseMigrationCheckpoint,
): Promise<ComputerUseMigrationCheckpoint> {
  const byKey = new Map(records.map((record) => [record.key, record]));
  for (const key of [...checkpoint.migratedKeys].reverse()) {
    const record = byKey.get(key);
    if (record) await target.remove(key, record.projectId);
  }
  return { sourceDigest: checkpoint.sourceDigest, cursor: 0, migratedKeys: [] };
}
