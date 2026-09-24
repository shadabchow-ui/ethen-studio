import { createHash } from "node:crypto";
import type { ReadRecord } from "./types";

const MAX_RECORDS_PER_RUN = 200;
const MAX_RUNS = 50;

const readRegistry = new Map<string, Map<string, ReadRecord>>();

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function recordFileRead(runId: string, relPath: string, content: string): void {
  if (!runId || !relPath) return;

  let runRecords = readRegistry.get(runId);
  if (!runRecords) {
    if (readRegistry.size >= MAX_RUNS) {
      const firstKey = readRegistry.keys().next().value;
      if (firstKey) readRegistry.delete(firstKey);
    }
    runRecords = new Map();
    readRegistry.set(runId, runRecords);
  }

  if (runRecords.size >= MAX_RECORDS_PER_RUN) return;

  runRecords.set(relPath, {
    path: relPath,
    contentHash: hashContent(content),
    readAt: new Date().toISOString(),
  });
}

export function getReadRecord(runId: string, relPath: string): ReadRecord | undefined {
  return readRegistry.get(runId)?.get(relPath);
}

export function getReadFiles(runId: string): ReadRecord[] {
  const runRecords = readRegistry.get(runId);
  if (!runRecords) return [];
  return [...runRecords.values()];
}

export function hasReadFile(runId: string, relPath: string): boolean {
  return readRegistry.get(runId)?.has(relPath) ?? false;
}

export function validateReadBeforeEdit(
  runId: string,
  targetPaths: string[],
  readFilesParam?: string[],
): { passed: boolean; unreadFiles: string[] } {
  const unreadFiles: string[] = [];
  const clientReadSet = new Set(readFilesParam ?? []);

  for (const targetPath of targetPaths) {
    const tracked = hasReadFile(runId, targetPath);
    const clientClaimed = clientReadSet.has(targetPath);
    if (!tracked && !clientClaimed) {
      unreadFiles.push(targetPath);
    }
  }

  return { passed: unreadFiles.length === 0, unreadFiles };
}

export function clearReadRecords(runId: string): void {
  readRegistry.delete(runId);
}

export function clearAllReadRecords(): void {
  readRegistry.clear();
}
