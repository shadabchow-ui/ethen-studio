import type {
  RunAttempt,
  RunContinuation,
  RunError,
  RunEvent,
  RunRecord,
  RunStatus,
} from "@ethen/contracts/platform/runs/contract";

export type AppendEventRecord = Omit<RunEvent, "sequence">;

export interface RunRepository {
  insertRun(run: RunRecord): Promise<void>;
  findRun(projectId: string, runId: string): Promise<RunRecord | null>;
  updateRunStatus(input: {
    projectId: string;
    runId: string;
    expectedStatus: RunStatus;
    status: RunStatus;
    error: RunError | null;
    updatedAt: string;
  }): Promise<RunRecord>;

  appendEvent(event: AppendEventRecord): Promise<RunEvent>;
  listEvents(projectId: string, runId: string): Promise<readonly RunEvent[]>;

  insertAttempt(attempt: RunAttempt): Promise<void>;
  updateAttempt(attempt: RunAttempt): Promise<void>;
  listAttempts(projectId: string, runId: string): Promise<readonly RunAttempt[]>;

  insertContinuation(continuation: RunContinuation): Promise<void>;
  listContinuations(
    projectId: string,
    runId: string,
  ): Promise<readonly RunContinuation[]>;
}
