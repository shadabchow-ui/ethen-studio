import {
  getComputerUseRun,
  getComputerUseSteps,
  getComputerUseScreenshots,
  getComputerUseApprovals,
  getComputerUseEvents,
  getComputerUseArtifacts,
} from "./store";
import type { ComputerUseRun, ComputerUseReplayEvent, ComputerUseStep, ComputerUseScreenshot, ComputerUseApproval } from "./types";

export interface CostField {
  provided: boolean;
  estimatedUsd?: number;
  tokensUsed?: number;
  note?: string;
}

export interface UsageSummary {
  runId: string;
  duration: {
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
    durationLabel: string;
  };
  steps: {
    total: number;
    max: number;
    byStatus: Record<string, number>;
  };
  actions: {
    total: number;
    proposed: number;
    executed: number;
    failed: number;
  };
  screenshots: {
    total: number;
  };
  observations: {
    total: number;
  };
  approvals: {
    total: number;
    pending: number;
    approved: number;
    denied: number;
  };
  blocked: {
    total: number;
  };
  recovery: {
    total: number;
  };
  browserSessionMode: "simulation" | "live_browser" | "unavailable" | null;
  status: string;
  resultStatus?: "success" | "partial" | "failed" | "blocked";
  mode: string;
  modelCost: CostField;
  browserCost: CostField;
  storageCost: CostField;
  hasReplay: boolean;
  hasBugReport: boolean;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
}

function countByType(events: ComputerUseReplayEvent[], typePrefix: string): number {
  return events.filter((e) => e.type.startsWith(typePrefix)).length;
}

function countByExactType(events: ComputerUseReplayEvent[], exactType: string): number {
  return events.filter((e) => e.type === exactType).length;
}

function stepStatusCounts(steps: ComputerUseStep[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of steps) {
    counts[s.status] = (counts[s.status] || 0) + 1;
  }
  return counts;
}

export function deriveUsageSummary(runId: string): UsageSummary | null {
  const run = getComputerUseRun(runId);
  if (!run) return null;

  const steps = getComputerUseSteps(runId);
  const screenshots = getComputerUseScreenshots(runId);
  const approvals = getComputerUseApprovals(runId);
  const events = getComputerUseEvents(runId);
  const artifacts = getComputerUseArtifacts(runId);

  const startedAt = run.startedAt;
  const completedAt = run.completedAt;
  const endTime = completedAt || new Date().toISOString();
  const durationMs = new Date(endTime).getTime() - new Date(startedAt).getTime();

  const totalApprovals = approvals.length;
  const approvedApprovals = approvals.filter((a) => a.decision === "approved").length;
  const deniedApprovals = approvals.filter((a) => a.decision === "denied").length;
  const pendingApprovals = approvals.filter((a) => !a.decision).length;

  const actionProposed = countByExactType(events, "action.proposed");
  const actionExecuted = countByExactType(events, "action.executed");
  const actionFailed = countByExactType(events, "action.failed");

  const modelCost: CostField = run.costEstimate
    ? {
        provided: true,
        estimatedUsd: run.costEstimate.estimatedUsd,
        tokensUsed: run.costEstimate.tokensUsed,
        note: run.costEstimate.estimatedUsd !== undefined
          ? undefined
          : run.costEstimate.tokensUsed !== undefined
            ? "token count only — no dollar estimate available"
            : "steps used only — no token or dollar data",
      }
    : { provided: false, note: "cost data not tracked" };

  return {
    runId,
    duration: {
      startedAt,
      completedAt,
      durationMs: durationMs > 0 ? durationMs : undefined,
      durationLabel: durationMs > 0 ? formatDuration(durationMs) : "in progress",
    },
    steps: {
      total: steps.length,
      max: run.maxSteps,
      byStatus: stepStatusCounts(steps),
    },
    actions: {
      total: actionProposed,
      proposed: actionProposed,
      executed: actionExecuted,
      failed: actionFailed,
    },
    screenshots: {
      total: screenshots.length,
    },
    observations: {
      total: countByExactType(events, "observation.captured"),
    },
    approvals: {
      total: totalApprovals,
      pending: pendingApprovals,
      approved: approvedApprovals,
      denied: deniedApprovals,
    },
    blocked: {
      total: countByType(events, "policy.blocked"),
    },
    recovery: {
      total: countByExactType(events, "recovery.started"),
    },
    browserSessionMode: run.sandbox.browserSessionMode ?? null,
    status: run.status,
    resultStatus: run.resultStatus,
    mode: run.mode,
    modelCost,
    browserCost: { provided: false, note: "browser runtime cost not tracked" },
    storageCost: { provided: false, note: "storage cost not tracked" },
    hasReplay: artifacts.some((a) => a.type === "replay"),
    hasBugReport: artifacts.some((a) => a.type === "report"),
  };
}

export function deriveUsageSummaryForRun(
  run: ComputerUseRun,
  steps: ComputerUseStep[],
  screenshots: ComputerUseScreenshot[],
  approvals: ComputerUseApproval[],
  events: ComputerUseReplayEvent[],
): UsageSummary {
  const startedAt = run.startedAt;
  const completedAt = run.completedAt;
  const endTime = completedAt || new Date().toISOString();
  const durationMs = new Date(endTime).getTime() - new Date(startedAt).getTime();

  const totalApprovals = approvals.length;
  const approvedApprovals = approvals.filter((a) => a.decision === "approved").length;
  const deniedApprovals = approvals.filter((a) => a.decision === "denied").length;
  const pendingApprovals = approvals.filter((a) => !a.decision).length;

  const actionProposed = countByExactType(events, "action.proposed");
  const actionExecuted = countByExactType(events, "action.executed");
  const actionFailed = countByExactType(events, "action.failed");

  const modelCost: CostField = run.costEstimate
    ? {
        provided: true,
        estimatedUsd: run.costEstimate.estimatedUsd,
        tokensUsed: run.costEstimate.tokensUsed,
        note: run.costEstimate.estimatedUsd !== undefined
          ? undefined
          : run.costEstimate.tokensUsed !== undefined
            ? "token count only — no dollar estimate available"
            : "steps used only — no token or dollar data",
      }
    : { provided: false, note: "cost data not tracked" };

  return {
    runId: run.id,
    duration: {
      startedAt,
      completedAt,
      durationMs: durationMs > 0 ? durationMs : undefined,
      durationLabel: durationMs > 0 ? formatDuration(durationMs) : "in progress",
    },
    steps: {
      total: steps.length,
      max: run.maxSteps,
      byStatus: stepStatusCounts(steps),
    },
    actions: {
      total: actionProposed,
      proposed: actionProposed,
      executed: actionExecuted,
      failed: actionFailed,
    },
    screenshots: {
      total: screenshots.length,
    },
    observations: {
      total: countByExactType(events, "observation.captured"),
    },
    approvals: {
      total: totalApprovals,
      pending: pendingApprovals,
      approved: approvedApprovals,
      denied: deniedApprovals,
    },
    blocked: {
      total: countByType(events, "policy.blocked"),
    },
    recovery: {
      total: countByExactType(events, "recovery.started"),
    },
    browserSessionMode: run.sandbox.browserSessionMode ?? null,
    status: run.status,
    resultStatus: run.resultStatus,
    mode: run.mode,
    modelCost,
    browserCost: { provided: false, note: "browser runtime cost not tracked" },
    storageCost: { provided: false, note: "storage cost not tracked" },
    hasReplay: false,
    hasBugReport: false,
  };
}
