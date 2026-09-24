/** Schedule trigger definition — one-time, interval, or cron. */
export type ScheduleDef =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string };

/** Lifecycle status of a schedule. */
export type ScheduleStatus = "active" | "paused" | "expired" | "error";

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  active: "Active",
  paused: "Paused",
  expired: "Expired",
  error: "Error",
};

/** Outcome of the last scheduled run. */
export type ScheduleLastRunStatus =
  | "ok"
  | "error"
  | "skipped"
  | "blocked";

export const SCHEDULE_LAST_RUN_LABELS: Record<ScheduleLastRunStatus, string> = {
  ok: "OK",
  error: "Error",
  skipped: "Skipped",
  blocked: "Blocked",
};

/**
 * A schedule that triggers autonomous employee work.
 * Payloads are employee-task / workflow / report oriented only.
 * Shell command execution is not supported.
 */
export interface EmployeeSchedule {
  id: string;
  orgId: string;
  employeeId: string;
  workflowId?: string;

  name: string;
  schedule: ScheduleDef;
  timezone: string;
  businessHoursOnly: boolean;

  status: ScheduleStatus;
  maxConsecutiveFailures: number;

  nextRunAt?: string;
  lastRunAt?: string;
  lastRunStatus?: ScheduleLastRunStatus;
  consecutiveFailures: number;

  createdAt: string;
  updatedAt: string;
}

/** Minimal schedule input for creating a new schedule. */
export interface CreateScheduleInput {
  orgId: string;
  employeeId: string;
  workflowId?: string;
  name: string;
  schedule: ScheduleDef;
  timezone: string;
  businessHoursOnly?: boolean;
  maxConsecutiveFailures?: number;
}
