import type {
  ComputerUseRun,
  ComputerUseRunStatus,
  ComputerUseMode,
  ComputerUseProvider,
  ComputerUseStep,
  ComputerUseScreenshot,
  ComputerUseApproval,
  ComputerUseArtifact,
  ComputerUseObservation,
  ComputerUseReplayEvent,
  PermissionScope,
  SandboxSession,
  ComputerAction,
  PolicyAccessMode,
} from "./types";
import { resolvePermissionScope, isPolicyTemplateName } from "./policy-templates";
import { createHash } from "node:crypto";

const runs = new Map<string, ComputerUseRun>();
const steps = new Map<string, ComputerUseStep[]>();
const screenshots = new Map<string, ComputerUseScreenshot[]>();
const approvals = new Map<string, ComputerUseApproval[]>();
const artifacts = new Map<string, ComputerUseArtifact[]>();
const observations = new Map<string, ComputerUseObservation[]>();
const events = new Map<string, ComputerUseReplayEvent[]>();

let runCounter = 0;
let stepCounter = 0;
let screenshotCounter = 0;
let approvalCounter = 0;
let artifactCounter = 0;
let eventCounter = 0;

export function resetComputerUseStore(): void {
  runs.clear();
  steps.clear();
  screenshots.clear();
  approvals.clear();
  artifacts.clear();
  observations.clear();
  events.clear();
  runCounter = 0;
  stepCounter = 0;
  screenshotCounter = 0;
  approvalCounter = 0;
  artifactCounter = 0;
  eventCounter = 0;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createComputerUseRun(run: Omit<ComputerUseRun, "id" | "createdAt" | "permissionScope"> & { id?: string; permissionScope?: Partial<PermissionScope> }): ComputerUseRun {
  const id = run.id ?? `cu-run-${++runCounter}`;
  const defaultScope: PermissionScope = {
    accessMode: "guided-browser",
    domainPolicyMode: "restricted",
    allowedDomains: [],
    blockedDomains: [],
    allowedActions: ["screenshot", "click", "type", "scroll", "navigate", "wait", "extractText", "extractLinks", "extractHeadings", "extractTable"],
    // Navigate, click, and type always require human approval by default.
    // Runtime policy additionally requires approval for form submission, purchase/payment,
    // account changes, publishing, deletion, messaging, and download/upload actions
    // detected through couldBeFormSubmit / isExfiltrationRisk checks in policy.ts.
    approvalRequiredActions: ["navigate", "click", "type"],
    blockedActions: [],
    credentialMode: "none",
    fileSystemScope: "none",
    networkMode: "allowlist",
    dataRetention: "session-only",
    maxSteps: run.maxSteps ?? 40,
    maxRuntimeMinutes: 15,
  };

  const permissionScope: PermissionScope = {
    ...defaultScope,
    ...run.permissionScope,
  };

  const created: ComputerUseRun = {
    ...run,
    id,
    permissionScope,
    startedAt: run.startedAt || nowIso(),
  };
  runs.set(id, created);
  steps.set(id, []);
  screenshots.set(id, []);
  approvals.set(id, []);
  artifacts.set(id, []);
  observations.set(id, []);
  events.set(id, []);
  return created;
}

export function getComputerUseRun(runId: string): ComputerUseRun | null {
  return runs.get(runId) ?? null;
}

export function setComputerUseRunStatus(runId: string, status: ComputerUseRunStatus): ComputerUseRun | null {
  const run = runs.get(runId);
  if (!run) return null;
  run.status = status;
  if (status === "complete" || status === "failed" || status === "cancelled" || status === "timed_out") {
    run.completedAt = nowIso();
  }
  runs.set(runId, run);
  return run;
}

export function listComputerUseRuns(): ComputerUseRun[] {
  return Array.from(runs.values());
}

export function addComputerUseStep(runId: string, step: Omit<ComputerUseStep, "id"> & { id?: string }): ComputerUseStep {
  const id = step.id ?? `cu-step-${++stepCounter}`;
  const created: ComputerUseStep = { ...step, id };
  const runSteps = steps.get(runId) || [];
  runSteps.push(created);
  steps.set(runId, runSteps);
  return created;
}

export function getComputerUseSteps(runId: string): ComputerUseStep[] {
  return steps.get(runId) ?? [];
}

export function addComputerUseScreenshot(runId: string, screenshot: ComputerUseScreenshot): ComputerUseScreenshot {
  const runScreenshots = screenshots.get(runId) || [];
  runScreenshots.push(screenshot);
  screenshots.set(runId, runScreenshots);
  return screenshot;
}

export function getComputerUseScreenshots(runId: string): ComputerUseScreenshot[] {
  return screenshots.get(runId) ?? [];
}

export function addComputerUseApproval(runId: string, approval: ComputerUseApproval): ComputerUseApproval {
  const runApprovals = approvals.get(runId) || [];
  runApprovals.push(approval);
  approvals.set(runId, runApprovals);
  return approval;
}

export function getComputerUseApprovals(runId: string): ComputerUseApproval[] {
  return approvals.get(runId) ?? [];
}

export function addComputerUseArtifact(runId: string, artifact: Omit<ComputerUseArtifact, "id" | "createdAt" | "runId"> & { id?: string }): ComputerUseArtifact {
  const id = artifact.id ?? `cu-artifact-${++artifactCounter}`;
  const created: ComputerUseArtifact = {
    ...artifact,
    id,
    runId,
    createdAt: nowIso(),
  };
  const runArtifacts = artifacts.get(runId) || [];
  runArtifacts.push(created);
  artifacts.set(runId, runArtifacts);
  return created;
}

export function getComputerUseArtifacts(runId: string): ComputerUseArtifact[] {
  return artifacts.get(runId) ?? [];
}

export function addComputerUseObservation(runId: string, observation: ComputerUseObservation): ComputerUseObservation {
  const runObservations = observations.get(runId) || [];
  runObservations.push(observation);
  observations.set(runId, runObservations);
  return observation;
}

export function getComputerUseObservations(runId: string): ComputerUseObservation[] {
  return observations.get(runId) ?? [];
}

export function addComputerUseEvent(runId: string, event: Omit<ComputerUseReplayEvent, "id"> & { id?: string }): ComputerUseReplayEvent {
  const id = event.id ?? `cu-event-${++eventCounter}`;
  const created: ComputerUseReplayEvent = { ...event, id };
  const runEvents = events.get(runId) || [];
  runEvents.push(created);
  events.set(runId, runEvents);
  return created;
}

export function getComputerUseEvents(runId: string): ComputerUseReplayEvent[] {
  return events.get(runId) ?? [];
}

export { nowIso as getNowIso };

export function getRun(id: string): ComputerUseRun | null {
  return getComputerUseRun(id);
}

export function updateRunStatus(id: string, status: ComputerUseRunStatus): ComputerUseRun | null {
  return setComputerUseRunStatus(id, status);
}

export function getStepsForRun(runId: string): ComputerUseStep[] {
  return getComputerUseSteps(runId);
}

export function getScreenshotsForRun(runId: string): ComputerUseScreenshot[] {
  return getComputerUseScreenshots(runId);
}

export function getApprovalsForRun(runId: string): ComputerUseApproval[] {
  return getComputerUseApprovals(runId);
}

export function getArtifactsForRun(runId: string): ComputerUseArtifact[] {
  return getComputerUseArtifacts(runId);
}

export function getEventsForRun(runId: string): ComputerUseReplayEvent[] {
  return getComputerUseEvents(runId);
}

export function resetStore(): void {
  resetComputerUseStore();
}

export function takeoverRun(id: string): ComputerUseRun | null {
  const existing = runs.get(id);
  if (!existing) return null;
  if (existing.status === "complete" || existing.status === "failed" || existing.status === "cancelled") return null;

  const updated: ComputerUseRun = { ...existing, status: "takeover" };
  runs.set(id, updated);

  addComputerUseEvent(id, {
    id: `cu-event-${++eventCounter}`,
    runId: id,
    type: "user.takeover.started",
    timestamp: nowIso(),
    actor: "user",
  });

  return updated;
}

export function returnFromTakeover(id: string): ComputerUseRun | null {
  const existing = runs.get(id);
  if (!existing) return null;
  if (existing.status !== "takeover") return null;

  const updated: ComputerUseRun = { ...existing, status: "running" };
  runs.set(id, updated);

  addComputerUseEvent(id, {
    id: `cu-event-${++eventCounter}`,
    runId: id,
    type: "user.takeover.ended",
    timestamp: nowIso(),
    actor: "user",
  });

  return updated;
}

// ── Higher-level convenience operations ───────────────────────────────────

export interface CreateRunInput {
  userId: string;
  orgId?: string;
  projectId?: string;
  title: string;
  task: string;
  mode?: ComputerUseMode;
  provider?: ComputerUseProvider;
  maxSteps?: number;
  allowedDomains?: string[];
  templateName?: PolicyAccessMode;
  permissionScope?: Partial<PermissionScope>;
  sandbox?: Partial<SandboxSession>;
}

export function createRun(input: CreateRunInput): ComputerUseRun {
  const id = `cu-run-${++runCounter}`;
  const now = nowIso();

  const scope = resolvePermissionScope(
    input.templateName,
    input.permissionScope
      ? { allowedDomains: input.allowedDomains ?? [], ...input.permissionScope }
      : { allowedDomains: input.allowedDomains ?? [] },
  );

  const run: ComputerUseRun = {
    id,
    userId: input.userId,
    orgId: input.orgId,
    projectId: input.projectId,
    title: input.title,
    mode: input.mode ?? "browser",
    provider: input.provider ?? "playwright",
    status: "idle",
    task: input.task,
    taskBrief: {
      goal: input.title,
      environment: `${input.mode ?? "browser"} sandbox`,
      allowedDomains: scope.allowedDomains,
      allowedActions: scope.allowedActions,
      requiresApprovalFor: scope.approvalRequiredActions,
      maxSteps: scope.maxSteps,
    },
    permissionScope: scope,
    sandbox: {
      sandboxId: `${id}-sandbox`,
      mode: input.mode ?? "browser",
      status: "creating",
      viewport: { width: 1280, height: 720, scale: 1 },
      createdAt: now,
      ...input.sandbox,
    },
    stepCount: 0,
    maxSteps: scope.maxSteps,
    startedAt: now,
    costEstimate: { stepsUsed: 0 },
  };

  runs.set(id, run);
  steps.set(id, []);
  screenshots.set(id, []);
  approvals.set(id, []);
  artifacts.set(id, []);
  observations.set(id, []);
  events.set(id, []);

  addComputerUseEvent(id, {
    id: `cu-event-${++eventCounter}`,
    runId: id,
    type: "run.started",
    timestamp: now,
    actor: "user",
    metadata: { title: input.title },
  });

  return run;
}

export function listRuns(): ComputerUseRun[] {
  return Array.from(runs.values()).sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt),
  );
}

export function addStep(runId: string, action: ComputerAction, overrides?: Partial<ComputerUseStep>): ComputerUseStep | null {
  const run = runs.get(runId);
  if (!run) return null;

  const existingSteps = steps.get(runId) ?? [];
  const stepIndex = existingSteps.length;
  const now = nowIso();

  const step: ComputerUseStep = {
    id: `cu-step-${++stepCounter}`,
    runId,
    index: stepIndex,
    status: "proposed",
    action,
    startedAt: now,
    ...overrides,
  };

  existingSteps.push(step);
  steps.set(runId, existingSteps);

  run.stepCount = existingSteps.length;
  run.currentStepId = step.id;

  addComputerUseEvent(runId, {
    id: `cu-event-${++eventCounter}`,
    runId,
    type: "action.proposed",
    timestamp: now,
    actor: "agent",
    stepId: step.id,
    action,
  });

  return step;
}

export function updateStepStatus(
  stepId: string,
  status: ComputerUseStep["status"],
  extra?: Partial<ComputerUseStep>,
): ComputerUseStep | null {
  for (const [, runSteps] of steps) {
    const idx = runSteps.findIndex((s) => s.id === stepId);
    if (idx !== -1) {
      const now = nowIso();
      const updated: ComputerUseStep = {
        ...runSteps[idx],
        status,
        ...extra,
        completedAt: status === "executed" || status === "failed" || status === "blocked"
          ? now
          : runSteps[idx].completedAt,
      };
      runSteps[idx] = updated;
      steps.set(runSteps[0]?.runId ?? "", runSteps);

      if (status === "executed" || status === "failed") {
        addComputerUseEvent(runSteps[0].runId, {
          id: `cu-event-${++eventCounter}`,
          runId: runSteps[0].runId,
          type: status === "executed" ? "action.executed" : "action.failed",
          timestamp: now,
          actor: "runtime",
          stepId: updated.id,
          action: updated.action,
          result: updated.result,
        });
      }

      return updated;
    }
  }
  return null;
}

export function addScreenshot(
  runId: string,
  imageUri: string,
  overrides?: Partial<ComputerUseScreenshot>,
): ComputerUseScreenshot {
  const now = nowIso();
  const screenshot: ComputerUseScreenshot = {
    id: `cu-screenshot-${++screenshotCounter}`,
    runId,
    capturedAt: now,
    originalWidth: 1280,
    originalHeight: 720,
    sentWidth: 1280,
    sentHeight: 720,
    scaleX: 1,
    scaleY: 1,
    devicePixelRatio: 1,
    imageUri,
    hash: `mock-hash-${screenshotCounter}`,
    ...overrides,
  };

  const runScreenshots = screenshots.get(runId) ?? [];
  runScreenshots.push(screenshot);
  screenshots.set(runId, runScreenshots);

  addComputerUseEvent(runId, {
    id: `cu-event-${++eventCounter}`,
    runId,
    type: "observation.captured",
    timestamp: now,
    actor: "agent",
    screenshotId: screenshot.id,
    stepId: overrides?.stepId,
  });

  return screenshot;
}

function normalizeUrlForIdentity(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    u.hash = "";
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function computeCanonicalActionIdentity(action: ComputerAction): string {
  const t = action.type;
  const fields: Record<string, unknown> = { type: t };

  switch (t) {
    case "navigate": {
      if (action.url !== undefined) fields.url = normalizeUrlForIdentity(action.url);
      break;
    }
    case "click":
    case "dom_click":
    case "double_click": {
      if (action.x !== undefined) fields.x = action.x;
      if (action.y !== undefined) fields.y = action.y;
      fields.button = action.button ?? "left";
      if (action.selector !== undefined) fields.selector = action.selector;
      if (action.ref !== undefined) fields.ref = action.ref;
      if (action.targetLabel !== undefined) fields.targetLabel = action.targetLabel;
      break;
    }
    case "drag": {
      if (action.from !== undefined) fields.from = action.from;
      if (action.to !== undefined) fields.to = action.to;
      break;
    }
    case "scroll": {
      fields.direction = action.direction ?? "down";
      fields.amount = action.amount ?? 0;
      break;
    }
    case "type":
    case "dom_type": {
      if (action.text !== undefined) fields.text = action.text;
      fields.sensitive = action.sensitive ?? false;
      if (action.targetLabel !== undefined) fields.targetLabel = action.targetLabel;
      if (action.selector !== undefined) fields.selector = action.selector;
      if (action.ref !== undefined) fields.ref = action.ref;
      break;
    }
    case "key":
    case "pressKey": {
      if (action.keys !== undefined) fields.keys = action.keys;
      else if (action.text !== undefined) fields.text = action.text;
      break;
    }
    case "wait": {
      fields.ms = action.ms ?? 0;
      break;
    }
    case "screenshot":
    case "inspectDom": {
      break;
    }
    case "extractText":
    case "extractTable": {
      if (action.selector !== undefined) fields.selector = action.selector;
      break;
    }
    case "extractLinks":
    case "extractHeadings": {
      break;
    }
    case "complete": {
      if (action.summary !== undefined) fields.summary = action.summary;
      if (action.reason !== undefined) fields.reason = action.reason;
      break;
    }
    case "fail": {
      if (action.reason !== undefined) fields.reason = action.reason;
      if (action.summary !== undefined) fields.summary = action.summary;
      break;
    }
    // Desktop actions — mirror browser counterparts
    case "desktop_screenshot": {
      break;
    }
    case "desktop_click": {
      if (action.x !== undefined) fields.x = action.x;
      if (action.y !== undefined) fields.y = action.y;
      fields.button = action.button ?? "left";
      if (action.targetLabel !== undefined) fields.targetLabel = action.targetLabel;
      break;
    }
    case "desktop_type": {
      if (action.text !== undefined) fields.text = action.text;
      fields.sensitive = action.sensitive ?? false;
      if (action.targetLabel !== undefined) fields.targetLabel = action.targetLabel;
      break;
    }
    case "desktop_key": {
      if (action.keys !== undefined) fields.keys = action.keys;
      else if (action.text !== undefined) fields.text = action.text;
      break;
    }
    case "desktop_scroll": {
      fields.direction = action.direction ?? "down";
      fields.amount = action.amount ?? 0;
      break;
    }
    case "desktop_app_switch":
    case "desktop_app_open": {
      if (action.targetLabel !== undefined) fields.targetLabel = action.targetLabel;
      break;
    }
    case "desktop_clipboard_read": {
      break;
    }
    case "desktop_clipboard_write": {
      if (action.text !== undefined) fields.text = action.text;
      break;
    }
    case "desktop_file_download":
    case "desktop_file_upload":
    case "desktop_file_access": {
      if (action.url !== undefined) fields.url = action.url;
      break;
    }
    case "desktop_terminal_exec": {
      if (action.text !== undefined) fields.text = action.text;
      break;
    }
    case "desktop_credential_field":
    case "desktop_os_settings":
    case "desktop_system_dialog": {
      if (action.targetLabel !== undefined) fields.targetLabel = action.targetLabel;
      break;
    }
    default: {
      if (action.x !== undefined) fields.x = action.x;
      if (action.y !== undefined) fields.y = action.y;
      if (action.button !== undefined) fields.button = action.button;
      if (action.from !== undefined) fields.from = action.from;
      if (action.to !== undefined) fields.to = action.to;
      if (action.direction !== undefined) fields.direction = action.direction;
      if (action.amount !== undefined) fields.amount = action.amount;
      if (action.text !== undefined) fields.text = action.text;
      if (action.keys !== undefined) fields.keys = action.keys;
      if (action.ms !== undefined) fields.ms = action.ms;
      if (action.url !== undefined) fields.url = action.url;
      if (action.ref !== undefined) fields.ref = action.ref;
      if (action.selector !== undefined) fields.selector = action.selector;
      if (action.targetLabel !== undefined) fields.targetLabel = action.targetLabel;
      break;
    }
  }

  return JSON.stringify(fields);
}

export function computePayloadHash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

export function getExpiredApprovals(runId: string): ComputerUseApproval[] {
  const now = new Date();
  return (approvals.get(runId) ?? []).filter(
    (a) => !a.decision && a.expiresAt && new Date(a.expiresAt) < now,
  );
}

export function deriveTargetDomain(action: ComputerAction): string | undefined {
  if (action.url) {
    try { return new URL(action.url).hostname; } catch { return action.url; }
  }
  return undefined;
}

export function derivePayloadPreview(action: ComputerAction): string | undefined {
  const t = action.type;
  if (t === "navigate" && action.url) return `Navigate to ${action.url}`;
  if (t === "click" || t === "dom_click" || t === "double_click") {
    return `Click${action.targetLabel ? ` "${action.targetLabel}"` : ""}${action.x !== undefined && action.y !== undefined ? ` at (${action.x},${action.y})` : ""}`;
  }
  if (t === "type" || t === "dom_type") {
    return `Type${action.sensitive ? " ***" : action.text ? ` "${action.text.length > 40 ? action.text.slice(0, 40) + "…" : action.text}"` : ""}${action.targetLabel ? ` into "${action.targetLabel}"` : ""}`;
  }
  if (t === "scroll") return `Scroll ${action.direction ?? "down"} by ${action.amount ?? 0}px`;
  if (t === "key" || t === "pressKey") {
    const k = action.keys ?? (action.text ? [action.text] : []);
    return `Press key(s): ${k.length > 0 ? k.join(", ") : "none"}`;
  }
  if (t === "wait") return `Wait ${action.ms ?? 0}ms`;
  if (t === "screenshot") return "Capture screenshot";
  if (t === "inspectDom") return "Inspect DOM";
  if (t === "extractText") return `Extract text${action.selector ? ` from "${action.selector}"` : ""}`;
  if (t === "extractLinks") return "Extract links";
  if (t === "extractHeadings") return "Extract headings";
  if (t === "extractTable") return `Extract table${action.selector ? ` from "${action.selector}"` : ""}`;
  if (t === "complete") return action.summary ?? "Mark complete";
  if (t === "fail") return action.reason ?? "Mark failed";
  return undefined;
}

export const APPROVAL_EXPIRY_MINUTES = 5;

export function requestApproval(input: {
  runId: string;
  stepId: string;
  action: ComputerAction;
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
}): ComputerUseApproval | null {
  const run = runs.get(input.runId);
  if (!run) return null;

  const identity = computeCanonicalActionIdentity(input.action);
  const approval: ComputerUseApproval = {
    id: `cu-approval-${++approvalCounter}`,
    runId: input.runId,
    stepId: input.stepId,
    requestedAt: nowIso(),
    requestedBy: "policy",
    action: input.action,
    riskLevel: input.riskLevel,
    reason: input.reason,
    redactionApplied: false,
    payloadIdentity: identity,
    payloadHash: computePayloadHash(identity),
    payloadPreview: derivePayloadPreview(input.action),
    targetDomain: deriveTargetDomain(input.action),
    expiresAt: new Date(Date.now() + APPROVAL_EXPIRY_MINUTES * 60000).toISOString(),
  };

  const runApprovals = approvals.get(input.runId) ?? [];
  runApprovals.push(approval);
  approvals.set(input.runId, runApprovals);

  setComputerUseRunStatus(input.runId, "approval_needed");

  addComputerUseEvent(input.runId, {
    id: `cu-event-${++eventCounter}`,
    runId: input.runId,
    type: "approval.requested",
    timestamp: nowIso(),
    actor: "policy",
    stepId: input.stepId,
    action: input.action,
    metadata: { approvalId: approval.id, riskLevel: input.riskLevel, reason: input.reason },
  });

  return approval;
}

export function resolveApproval(
  approvalId: string,
  decision: "approved" | "denied" | "expired",
  resolvedBy?: string,
  runId?: string,
): ComputerUseApproval | null {
  let runApprovals: ComputerUseApproval[] | undefined;

  if (runId) {
    runApprovals = approvals.get(runId);
  }

  if (!runApprovals) {
    for (const [, arr] of approvals) {
      if (arr.some((a) => a.id === approvalId)) {
        runApprovals = arr;
        break;
      }
    }
  }

  if (!runApprovals) return null;

  const idx = runApprovals.findIndex((a) => a.id === approvalId);
  if (idx === -1) return null;

  const existing = runApprovals[idx];

  if (existing.decision) {
    if (existing.decision === decision) {
      return existing;
    }
    return null;
  }

  const now = nowIso();

  if (existing.expiresAt && new Date(existing.expiresAt) < new Date()) {
    return {
      ...existing,
      decision: "expired",
      resolvedAt: now,
      resolvedBy: "system",
    } as ComputerUseApproval;
  }

  if (existing.payloadHash) {
    const expectedHash = computePayloadHash(computeCanonicalActionIdentity(existing.action));
    if (existing.payloadHash !== expectedHash) {
      return null;
    }
  }

  const updated: ComputerUseApproval = {
    ...existing,
    decision,
    resolvedAt: now,
    resolvedBy: resolvedBy ?? "user",
  };
  runApprovals[idx] = updated;
  approvals.set(existing.runId, runApprovals);

  addComputerUseEvent(existing.runId, {
    id: `cu-event-${++eventCounter}`,
    runId: existing.runId,
    type: decision === "approved" ? "approval.approved" : "approval.denied",
    timestamp: now,
    actor: "user",
    stepId: updated.stepId,
    metadata: { approvalId, decision },
  });

  return updated;
}

export function getPendingApprovals(runId: string): ComputerUseApproval[] {
  return (approvals.get(runId) ?? []).filter((a) => !a.decision);
}

export function updateRunSandbox(
  runId: string,
  sandboxUpdate: Partial<SandboxSession>,
): ComputerUseRun | null {
  const run = runs.get(runId);
  if (!run) return null;
  run.sandbox = { ...run.sandbox, ...sandboxUpdate };
  runs.set(runId, run);
  return run;
}

export function addArtifact(
  runId: string,
  artifact: Omit<ComputerUseArtifact, "id" | "createdAt" | "runId"> & { id?: string },
): ComputerUseArtifact | null {
  const run = runs.get(runId);
  if (!run) return null;

  const created = addComputerUseArtifact(runId, artifact);

  addComputerUseEvent(runId, {
    id: `cu-event-${++eventCounter}`,
    runId,
    type: "artifact.created",
    timestamp: nowIso(),
    actor: "runtime",
    metadata: { artifactId: created.id, type: created.type, title: created.title },
  });

  return created;
}
