import type {
  ComputerUseRun,
  ComputerUseStep,
  ComputerUseScreenshot,
  ComputerUseReplayEvent,
  ComputerUseObservation,
  ObservationAvailability,
  ObservationSource,
  ObservationElementExcerpt,
  ObservationElementRef,
  ObservationCoordinateMetadata,
} from "../types";
import type { BrowserSession } from "../actions";
import type {
  ObservationPacket,
  ActionSummary,
  BudgetState,
  PlanStep,
  UntrustedBlock,
} from "./types";
import { buildObservation } from "../observation-builder";

const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_\s-]?key/i,
  /credential/i,
  /cookie/i,
  /session/i,
  /auth/i,
  /private[_\s-]?key/i,
  /access[_\s-]?key/i,
];

const MAX_RECENT_ACTIONS = 10;

function elapsedMinutes(startedAt: string | undefined, now: Date = new Date()): number {
  if (!startedAt) return 0;
  const elapsed = now.getTime() - new Date(startedAt).getTime();
  return Math.round(elapsed / 60000);
}

function buildActionSummary(step: ComputerUseStep): ActionSummary {
  return {
    stepIndex: step.index,
    actionType: step.action.type,
    description: step.action.summary ?? step.action.type,
    status: step.status,
    success: step.result?.success ?? false,
    browserSessionMode: step.result?.browserSessionMode,
  };
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((p) => p.test(key));
}

function stripSensitiveMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (!isSensitiveKey(k)) {
      safe[k] = v;
    }
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function buildUntrustedBlock(
  source: UntrustedBlock["source"],
  content: string | null | undefined,
): UntrustedBlock | null {
  if (!content) return null;
  return { label: "untrusted", source, content };
}

function derivePlanSteps(run: ComputerUseRun, steps: ComputerUseStep[]): PlanStep[] | null {
  const mapped = steps.map((s) => ({
    stepNumber: s.index,
    description: s.action.summary ?? s.action.type,
    status: mapStepStatusToPlanStatus(s.status),
  }));

  if (mapped.length === 0) {
    if (run.task) {
      return [{ stepNumber: 0, description: run.task, status: "pending" }];
    }
    return null;
  }

  return mapped;
}

function mapStepStatusToPlanStatus(
  status: ComputerUseStep["status"],
): PlanStep["status"] {
  switch (status) {
    case "proposed":
    case "approved":
      return "pending";
    case "executed":
    case "verified":
      return "completed";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    default:
      return "pending";
  }
}

function buildBudgetState(
  run: ComputerUseRun,
  stepIndex: number,
): BudgetState {
  const stepsUsed = stepIndex + 1;
  const runtimeMinutes = elapsedMinutes(run.startedAt);
  const overMaxSteps = stepsUsed >= run.maxSteps;
  const overMaxTime = run.permissionScope.maxRuntimeMinutes
    ? runtimeMinutes >= run.permissionScope.maxRuntimeMinutes
    : false;
  const overMaxCost = run.permissionScope.maxCostUsd !== undefined &&
    run.costEstimate?.estimatedUsd !== undefined &&
    run.costEstimate.estimatedUsd >= run.permissionScope.maxCostUsd;

  const overBudget = overMaxSteps || overMaxTime || overMaxCost;

  const reasons: string[] = [];
  if (overMaxSteps) reasons.push("max steps reached");
  if (overMaxTime) reasons.push("max runtime exceeded");
  if (overMaxCost) reasons.push("max cost exceeded");

  return {
    stepsUsed,
    maxSteps: run.maxSteps,
    maxRuntimeMinutes: run.permissionScope.maxRuntimeMinutes,
    runtimeMinutesElapsed: runtimeMinutes,
    maxCostUsd: run.permissionScope.maxCostUsd,
    costUsdUsed: run.costEstimate?.estimatedUsd,
    overBudget,
    overBudgetReason: reasons.length > 0 ? reasons.join(", ") : undefined,
  };
}

export interface BuildObservationPacketInput {
  run: ComputerUseRun;
  steps: ComputerUseStep[];
  screenshots: ComputerUseScreenshot[];
  events: ComputerUseReplayEvent[];
  observations?: ComputerUseObservation[];
  session?: BrowserSession;
}

export function buildObservationPacket(input: BuildObservationPacketInput): ObservationPacket {
  const { run, steps, screenshots, events, observations, session } = input;

  // Delegate to the ObservationBuilder for normalized observation data.
  const ob = buildObservation({
    run,
    steps,
    screenshots,
    events,
    observations,
    session,
  });

  const stepIndex = ob.stepIndex ?? 0;

  const recentSteps = steps.slice(-MAX_RECENT_ACTIONS);
  const lastActions: ActionSummary[] = recentSteps.map(buildActionSummary);

  const latestScreenshot = screenshots.length > 0
    ? {
        id: screenshots[screenshots.length - 1].id,
        capturedAt: screenshots[screenshots.length - 1].capturedAt,
        width: screenshots[screenshots.length - 1].originalWidth,
        height: screenshots[screenshots.length - 1].originalHeight,
        label: screenshots[screenshots.length - 1].label ?? null,
      }
    : null;

  const activePlan = derivePlanSteps(run, steps);

  const pendingApprovalEvent = events
    .slice()
    .reverse()
    .find((e) => e.type === "approval.requested");

  const pendingApproval = pendingApprovalEvent
    ? {
        stepId: pendingApprovalEvent.stepId ?? "unknown",
        actionType: pendingApprovalEvent.action?.type ?? "unknown",
        reason: (pendingApprovalEvent.metadata?.reason as string) ?? "Approval requested",
        riskLevel: (pendingApprovalEvent.metadata?.riskLevel as string) ?? "medium",
      }
    : null;

  // Best-effort warning from the session (blank screenshot, still-loading page, etc.)
  const sessionWarning = session?.getObservationWarning?.() ?? null;

  // Extract table data from recent step results (not managed by ObservationBuilder)
  const lastTableExtract = steps
    .slice()
    .reverse()
    .find((s) => s.action.type === "extractTable" && s.result?.success);
  const extractedTable = lastTableExtract?.result?.data?.table?.slice(0, 20) ?? null;

  return {
    runId: run.id,
    stepIndex,
    userGoal: run.taskBrief?.goal ?? run.task ?? null,
    activePlan,
    currentUrl: ob.currentUrl,
    pageTitle: ob.pageTitle,
    browserSessionMode: ob.browserSessionMode,
    latestScreenshot,
    accessibilitySnapshot: ob.accessibilitySnapshotText,
    accessibilityAvailable: ob.accessibilitySnapshotText !== null,
    accessibilityRefs: ob.accessibilityRefs,
    observationWarning: sessionWarning,
    dataProvenance: ob.browserSessionMode,
    blockerHints: ob.blockerHints,
    availability: ob.availability,
    observationSource: ob.source,
    observationConfidence: ob.confidence,
    domSummary: ob.domSummary,
    visibleText: ob.visibleTextSummary,
    lastActions,
    pendingApproval,
    policyScope: {
      allowedDomains: run.permissionScope.allowedDomains ?? [],
      blockedDomains: run.permissionScope.blockedDomains ?? [],
      allowedActions: run.permissionScope.allowedActions ?? [],
      approvalRequiredActions: run.permissionScope.approvalRequiredActions ?? [],
      blockedActions: run.permissionScope.blockedActions ?? [],
      credentialMode: run.permissionScope.credentialMode ?? "none",
      fileSystemScope: run.permissionScope.fileSystemScope ?? "none",
      networkMode: run.permissionScope.networkMode ?? "allowlist",
    },
    remainingBudget: buildBudgetState(run, stepIndex),
    trustLabels: ob.trustLabels,
    extractedText: ob.visibleTextSummary,
    extractedLinks: ob.elementCategories.links.length > 0 ? ob.elementCategories.links : null,
    extractedHeadings: ob.elementCategories.headings.length > 0 ? ob.elementCategories.headings : null,
    extractedTable,
    domElements: ob.domSummary
      ? ob.domSummary.map((s) => {
          const [tag, ...rest] = s.split(":");
          return { tag, text: rest.join(":").replace(/^"|"$/g, "") };
        })
      : null,
    elementBoundingBoxes: ob.elementBoundingBoxes,
    elementRefs: ob.elementRefs,
    coordinateMetadata: ob.coordinateMetadata,
    blockerFlags: ob.blockerFlags,
    sensitiveFlags: ob.sensitiveFlags,
    elementCategories: ob.elementCategories,
    consoleErrorSummary: ob.consoleErrorSummary,
    networkFailureSummary: ob.networkFailureSummary,
  };
}
