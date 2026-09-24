import type { ComputerUseStorageAdapter } from "./storage";
import type { ComputerUseRun } from "./types";

const RECOVERABLE = new Set<ComputerUseRun["status"]>([
  "scoping",
  "starting",
  "running",
  "approval_needed",
]);

export async function recoverComputerUseRun(
  adapter: ComputerUseStorageAdapter,
  runId: string,
): Promise<ComputerUseRun | null> {
  if (adapter.kind === "in_memory" || adapter.kind === "localstorage") {
    throw new Error("Computer Use recovery requires durable tenant storage.");
  }
  const run = await adapter.runs.get(runId);
  if (!run || !RECOVERABLE.has(run.status)) return run;
  return adapter.runs.setStatus(runId, "recovering");
}
