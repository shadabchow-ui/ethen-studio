import type {
  ComputerUseRun,
  ComputerUseStep,
  ComputerUseReplayEvent,
  ComputerUseScreenshot,
  ComputerUseArtifact,
  ComputerUseApproval,
  ComputerUseObservation,
  BrowserSessionMode,
} from "./types";
import {
  getComputerUseRun,
  getComputerUseSteps,
  getComputerUseEvents,
  getComputerUseScreenshots,
  getComputerUseArtifacts,
  getComputerUseApprovals,
  getComputerUseObservations,
} from "./store-adapter";

export interface AuditBundle {
  runId: string;
  generatedAt: string;

  run: AuditRunSummary | null;
  policy: AuditPolicyScope | null;
  timeline: AuditTimelineEntry[];
  actions: AuditActionEntry[];
  screenshots: AuditScreenshotEntry[];
  approvals: AuditApprovalEntry[];
  artifacts: AuditArtifactEntry[];
  usage: AuditUsageSummary;
  status: AuditStatusEntry;
  limitations: string[];
  integrity: AuditIntegrityMetadata;
}

export interface AuditRunSummary {
  id: string;
  title: string;
  task: string;
  mode: string;
  provider: string;
  startedAt: string;
  completedAt?: string;
  resultStatus?: string;
  summary?: string;
  stepCount: number;
  maxSteps: number;
  /** The effective browser session mode if known */
  effectiveBrowserSessionMode: BrowserSessionMode | "not_provided";
}

export interface AuditPolicyScope {
  allowedDomains: string[];
  blockedDomains: string[];
  allowedActions: string[];
  approvalRequiredActions: string[];
  blockedActions: string[];
  credentialMode: string;
  fileSystemScope: string;
  networkMode: string;
  dataRetention: string;
  maxSteps: number;
  maxRuntimeMinutes: number;
  maxCostUsd?: number;
  /** Policy template/version — omitted if not available */
  policyVersion: "not_provided";
}

export interface AuditTimelineEntry {
  id: string;
  type: string;
  timestamp: string;
  actor: string;
  stepId?: string;
  screenshotId?: string;
  actionSummary?: string;
  decisionOutcome?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditActionEntry {
  stepId: string;
  index: number;
  status: string;
  actionType: string;
  actionDetail: Record<string, unknown>;
  policyOutcome?: string;
  policyReason?: string;
  resultSuccess?: boolean;
  resultError?: string;
  beforeScreenshotId?: string;
  afterScreenshotId?: string;
  startedAt: string;
  completedAt?: string;
  browserSessionMode?: BrowserSessionMode | "not_provided";
}

export interface AuditScreenshotEntry {
  id: string;
  capturedAt: string;
  dimensions: { width: number; height: number };
  available: boolean;
  hash: string;
  label?: string;
}

export interface AuditApprovalEntry {
  id: string;
  stepId: string;
  requestedAt: string;
  resolvedAt?: string;
  requestedBy: string;
  resolvedBy?: string;
  decision?: string;
  actionType: string;
  riskLevel: string;
  reason: string;
  redactionApplied: boolean;
}

export interface AuditArtifactEntry {
  id: string;
  type: string;
  title: string;
  contentType: string;
  sizeBytes: number;
  hash: string;
  redacted: boolean;
  createdAt: string;
}

export interface AuditUsageSummary {
  totalSteps: number;
  maxSteps: number;
  approvedSteps: number;
  deniedSteps: number;
  blockedSteps: number;
  failedSteps: number;
  stepsExecuted: number;
  screenshotsCaptured: number;
  screenshotsAvailable: number;
  artifactsProduced: number;
  approvalsRequested: number;
  approvalsResolved: number;
  eventsRecorded: number;
  durationMs: number | null;
  estimatedUsd?: number;
  tokensUsed?: number;
}

export interface AuditStatusEntry {
  status: string;
  isTerminal: boolean;
  outcome?: "success" | "partial" | "failed" | "blocked" | "not_provided";
  completionReason?: string;
}

export interface AuditIntegrityMetadata {
  eventsStableOrdered: boolean;
  stepsStableOrdered: boolean;
  screenshotsHashed: boolean;
  artifactsHashed: boolean;
  contentHashingAvailable: boolean;
  disclaimer: string;
}

const TERMINAL_STATUSES = new Set(["complete", "failed", "cancelled", "timed_out"]);

function stableSortByTimestamp<T extends { timestamp: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function stableSortByIndex<T extends { index: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.index - b.index);
}

function summarizeAction(action: unknown): string {
  const a = action as Record<string, unknown> | null;
  if (!a) return "unknown";
  const type = String(a.type ?? "unknown");
  const label = a.targetLabel ? ` on "${String(a.targetLabel)}"` : "";
  const url = a.url ? ` to ${String(a.url)}` : "";
  return `${type}${label}${url}`;
}

export function generateAuditBundle(runId: string): AuditBundle {
  const run = getComputerUseRun(runId);
  const steps = getComputerUseSteps(runId);
  const events = getComputerUseEvents(runId);
  const rawScreenshots = getComputerUseScreenshots(runId);
  const artifacts = getComputerUseArtifacts(runId);
  const approvals = getComputerUseApprovals(runId);
  const observations = getComputerUseObservations(runId);

  const limitations: string[] = [];

  if (!run) limitations.push("Run data not found in store. Audit is incomplete.");
  if (steps.length === 0) limitations.push("No steps were recorded for this run.");
  if (events.length === 0) limitations.push("No timeline events were recorded for this run.");
  if (rawScreenshots.length === 0) limitations.push("No screenshots were captured during this run.");
  if (observations.length === 0) limitations.push("No observation packets were recorded for this run.");
  limitations.push("Console logs are not captured by the current runtime.");
  limitations.push("Network logs are not captured by the current runtime.");
  limitations.push("This audit bundle has no cryptographic integrity guarantees and should not be treated as a forensic or compliance-grade artifact. It is a best-effort summary of stored run data.");

  const runSummary: AuditRunSummary | null = run
    ? {
        id: run.id,
        title: run.title || "not provided",
        task: run.task || "not provided",
        mode: run.mode,
        provider: run.provider,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        resultStatus: run.resultStatus,
        summary: run.summary,
        stepCount: run.stepCount,
        maxSteps: run.maxSteps,
        effectiveBrowserSessionMode: run.sandbox?.browserSessionMode ?? "not_provided",
      }
    : null;

  const policyScope: AuditPolicyScope | null = run
    ? {
        allowedDomains: run.permissionScope.allowedDomains,
        blockedDomains: run.permissionScope.blockedDomains,
        allowedActions: run.permissionScope.allowedActions,
        approvalRequiredActions: run.permissionScope.approvalRequiredActions,
        blockedActions: run.permissionScope.blockedActions,
        credentialMode: run.permissionScope.credentialMode,
        fileSystemScope: run.permissionScope.fileSystemScope,
        networkMode: run.permissionScope.networkMode,
        dataRetention: run.permissionScope.dataRetention,
        maxSteps: run.permissionScope.maxSteps,
        maxRuntimeMinutes: run.permissionScope.maxRuntimeMinutes,
        maxCostUsd: run.permissionScope.maxCostUsd,
        policyVersion: "not_provided",
      }
    : null;

  const timeline: AuditTimelineEntry[] = stableSortByTimestamp(events).map((e) => ({
    id: e.id,
    type: e.type,
    timestamp: e.timestamp,
    actor: e.actor,
    stepId: e.stepId,
    screenshotId: e.screenshotId,
    actionSummary: e.action ? summarizeAction(e.action) : undefined,
    decisionOutcome: e.policyDecision?.outcome,
    metadata: e.metadata,
  }));

  const actions: AuditActionEntry[] = stableSortByIndex(steps).map((s) => ({
    stepId: s.id,
    index: s.index,
    status: s.status,
    actionType: s.action.type,
    actionDetail: { ...s.action },
    policyOutcome: s.policyDecision?.outcome,
    policyReason: s.policyDecision?.reason,
    resultSuccess: s.result?.success,
    resultError: s.result?.error,
    beforeScreenshotId: s.beforeScreenshotId,
    afterScreenshotId: s.afterScreenshotId,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    browserSessionMode: s.result?.browserSessionMode ?? "not_provided",
  }));

  const screenshots: AuditScreenshotEntry[] = rawScreenshots.map((s) => ({
    id: s.id,
    capturedAt: s.capturedAt,
    dimensions: { width: s.originalWidth, height: s.originalHeight },
    available: !!s.imageUri && s.imageUri.length > 0,
    hash: s.hash,
    label: s.label,
  }));

  const approvalEntries: AuditApprovalEntry[] = approvals.map((a) => ({
    id: a.id,
    stepId: a.stepId,
    requestedAt: a.requestedAt,
    resolvedAt: a.resolvedAt,
    requestedBy: a.requestedBy,
    resolvedBy: a.resolvedBy,
    decision: a.decision,
    actionType: a.action.type,
    riskLevel: a.riskLevel,
    reason: a.reason,
    redactionApplied: a.redactionApplied,
  }));

  const artifactEntries: AuditArtifactEntry[] = artifacts.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    hash: a.hash,
    redacted: a.redacted,
    createdAt: a.createdAt,
  }));

  const durationMs = run?.startedAt && run?.completedAt
    ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
    : null;

  const usage: AuditUsageSummary = {
    totalSteps: steps.length,
    maxSteps: run?.maxSteps ?? 0,
    approvedSteps: steps.filter((s) => s.status === "executed").length,
    deniedSteps: steps.filter((s) => s.status === "blocked").length,
    blockedSteps: steps.filter((s) => s.status === "blocked").length,
    failedSteps: steps.filter((s) => s.status === "failed").length,
    stepsExecuted: steps.filter((s) => s.status === "executed").length,
    screenshotsCaptured: rawScreenshots.length,
    screenshotsAvailable: rawScreenshots.filter((s) => !!s.imageUri && s.imageUri.length > 0).length,
    artifactsProduced: artifacts.length,
    approvalsRequested: approvals.length,
    approvalsResolved: approvals.filter((a) => !!a.decision).length,
    eventsRecorded: events.length,
    durationMs,
    estimatedUsd: run?.costEstimate?.estimatedUsd,
    tokensUsed: run?.costEstimate?.tokensUsed,
  };

  const status: AuditStatusEntry = {
    status: run?.status ?? "unknown",
    isTerminal: run ? TERMINAL_STATUSES.has(run.status) : false,
    outcome: run?.resultStatus ?? "not_provided",
    completionReason: run?.status === "complete"
      ? "Run completed successfully"
      : run?.status === "failed"
        ? "Run failed — see actions/events for details"
        : run?.status === "cancelled"
          ? "Run was cancelled by the user"
          : run?.status === "timed_out"
            ? "Run exceeded its maximum runtime"
            : run?.status === "blocked"
              ? "Run was blocked by policy"
              : "not_provided",
  };

  const integrity: AuditIntegrityMetadata = {
    eventsStableOrdered: true,
    stepsStableOrdered: true,
    screenshotsHashed: rawScreenshots.every((s) => !!s.hash),
    artifactsHashed: artifacts.every((a) => !!a.hash),
    contentHashingAvailable: artifacts.some((a) => !!a.hash) || rawScreenshots.some((s) => !!s.hash),
    disclaimer:
      "Hashes are present in store records where available but do NOT constitute a cryptographically-secured audit trail. No chain-of-custody or signature verification is implemented. This is not a tamper-evident log and not a compliance-grade artifact — it is a best-effort data export and should not be treated as forensic evidence.",
  };

  return {
    runId,
    generatedAt: new Date().toISOString(),
    run: runSummary,
    policy: policyScope,
    timeline,
    actions,
    screenshots,
    approvals: approvalEntries,
    artifacts: artifactEntries,
    usage,
    status,
    limitations,
    integrity,
  };
}

export function generateAuditMarkdown(runId: string): string {
  const bundle = generateAuditBundle(runId);
  const lines: string[] = [];

  lines.push(`# Computer Use Run Audit Bundle`);
  lines.push(``);
  lines.push(`**Run ID:** \`${bundle.runId}\``);
  lines.push(`**Generated At:** ${bundle.generatedAt}`);
  lines.push(``);

  if (bundle.run) {
    const r = bundle.run;
    lines.push(`## Run Metadata`);
    lines.push(``);
    lines.push(`- **Title:** ${r.title}`);
    lines.push(`- **Task/Goal:** ${r.task}`);
    lines.push(`- **Mode:** ${r.mode}`);
    lines.push(`- **Provider:** ${r.provider}`);
    lines.push(`- **Effective Browser Session Mode:** ${r.effectiveBrowserSessionMode}`);
    lines.push(`- **Started:** ${r.startedAt}`);
    if (r.completedAt) lines.push(`- **Completed:** ${r.completedAt}`);
    if (r.resultStatus) lines.push(`- **Result:** ${r.resultStatus}`);
    if (r.summary) lines.push(`- **Summary:** ${r.summary}`);
    lines.push(`- **Step Count:** ${r.stepCount} / ${r.maxSteps}`);
    lines.push(``);
  }

  if (bundle.policy) {
    lines.push(`## Policy Scope`);
    lines.push(``);
    lines.push(`- **Allowed Domains:** ${bundle.policy.allowedDomains.join(", ") || "(none)"}`);
    lines.push(`- **Blocked Domains:** ${bundle.policy.blockedDomains.join(", ") || "(none)"}`);
    lines.push(`- **Allowed Actions:** ${bundle.policy.allowedActions.join(", ") || "(none)"}`);
    lines.push(`- **Approval-Required Actions:** ${bundle.policy.approvalRequiredActions.join(", ") || "(none)"}`);
    lines.push(`- **Blocked Actions:** ${bundle.policy.blockedActions.join(", ") || "(none)"}`);
    lines.push(`- **Credential Mode:** ${bundle.policy.credentialMode}`);
    lines.push(`- **File System Scope:** ${bundle.policy.fileSystemScope}`);
    lines.push(`- **Network Mode:** ${bundle.policy.networkMode}`);
    lines.push(`- **Data Retention:** ${bundle.policy.dataRetention}`);
    lines.push(`- **Max Steps:** ${bundle.policy.maxSteps}`);
    lines.push(`- **Max Runtime:** ${bundle.policy.maxRuntimeMinutes} min`);
    lines.push(`- **Policy Version:** ${bundle.policy.policyVersion}`);
    lines.push(``);
  }

  lines.push(`## Status`);
  lines.push(``);
  lines.push(`- **Status:** ${bundle.status.status}`);
  lines.push(`- **Terminal:** ${bundle.status.isTerminal ? "yes" : "no"}`);
  lines.push(`- **Outcome:** ${bundle.status.outcome}`);
  if (bundle.status.completionReason) lines.push(`- **Reason:** ${bundle.status.completionReason}`);
  lines.push(``);

  if (bundle.actions.length > 0) {
    lines.push(`## Actions (${bundle.actions.length})`);
    lines.push(``);
    for (const a of bundle.actions) {
      lines.push(`### Step ${a.index}: ${a.actionType}`);
      lines.push(``);
      lines.push(`- **Status:** ${a.status}`);
      if (a.policyOutcome) lines.push(`- **Policy:** ${a.policyOutcome} — ${a.policyReason ?? "no reason"}`);
      if (a.resultSuccess !== undefined) lines.push(`- **Result:** ${a.resultSuccess ? "success" : "failed"}`);
      if (a.resultError) lines.push(`- **Error:** ${a.resultError}`);
      if (a.beforeScreenshotId) lines.push(`- **Before Screenshot:** ${a.beforeScreenshotId}`);
      if (a.afterScreenshotId) lines.push(`- **After Screenshot:** ${a.afterScreenshotId}`);
      lines.push(`- **Browser Session Mode:** ${a.browserSessionMode}`);
      lines.push(``);
    }
  }

  if (bundle.approvals.length > 0) {
    lines.push(`## Approvals (${bundle.approvals.length})`);
    lines.push(``);
    for (const a of bundle.approvals) {
      lines.push(`- **${a.decision ?? "pending"}** — ${a.actionType} (risk: ${a.riskLevel})`);
      lines.push(`  - Reason: ${a.reason}`);
      if (a.resolvedBy) lines.push(`  - Resolved by: ${a.resolvedBy}`);
      lines.push(``);
    }
  }

  if (bundle.screenshots.length > 0) {
    lines.push(`## Screenshots (${bundle.screenshots.length})`);
    lines.push(``);
    lines.push(`- **Available:** ${bundle.screenshots.filter((s) => s.available).length}`);
    lines.push(`- **Unavailable:** ${bundle.screenshots.filter((s) => !s.available).length}`);
    lines.push(``);
  }

  if (bundle.artifacts.length > 0) {
    lines.push(`## Artifacts (${bundle.artifacts.length})`);
    lines.push(``);
    for (const a of bundle.artifacts) {
      lines.push(`- **${a.title}** (${a.type}, ${a.contentType}, ${a.sizeBytes}B, redacted: ${a.redacted})`);
    }
    lines.push(``);
  }

  lines.push(`## Usage Summary`);
  lines.push(``);
  const u = bundle.usage;
  if (u) {
    lines.push(`- **Steps Executed:** ${u.stepsExecuted} / ${u.totalSteps}`);
    lines.push(`- **Failed Steps:** ${u.failedSteps}`);
    lines.push(`- **Blocked Steps:** ${u.blockedSteps}`);
    lines.push(`- **Screenshots Available:** ${u.screenshotsAvailable} / ${u.screenshotsCaptured}`);
    lines.push(`- **Artifacts Produced:** ${u.artifactsProduced}`);
    lines.push(`- **Approvals Resolved:** ${u.approvalsResolved} / ${u.approvalsRequested}`);
    lines.push(`- **Events Recorded:** ${u.eventsRecorded}`);
    if (u.durationMs !== null) lines.push(`- **Duration:** ${(u.durationMs / 1000).toFixed(1)}s`);
  }
  lines.push(``);

  lines.push(`## Integrity`);
  lines.push(``);
  lines.push(`- **Events Stable Ordered:** ${bundle.integrity.eventsStableOrdered}`);
  lines.push(`- **Steps Stable Ordered:** ${bundle.integrity.stepsStableOrdered}`);
  lines.push(`- **Screenshots Hashed:** ${bundle.integrity.screenshotsHashed}`);
  lines.push(`- **Artifacts Hashed:** ${bundle.integrity.artifactsHashed}`);
  lines.push(`- **Content Hashing Available:** ${bundle.integrity.contentHashingAvailable}`);
  lines.push(``);
  lines.push(`> ${bundle.integrity.disclaimer}`);
  lines.push(``);

  if (bundle.limitations.length > 0) {
    lines.push(`## Limitations`);
    lines.push(``);
    for (const l of bundle.limitations) {
      lines.push(`- ${l}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

export function validateAuditBundleShape(bundle: AuditBundle): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
} {
  const checks: Array<{ name: string; passed: boolean; detail: string }> = [];

  checks.push({
    name: "run_metadata_present",
    passed: bundle.run !== null,
    detail: bundle.run ? "Run metadata is present" : "Run metadata is null",
  });

  checks.push({
    name: "policy_scope_present",
    passed: bundle.policy !== null,
    detail: bundle.policy ? "Policy scope is present" : "Policy scope is null",
  });

  checks.push({
    name: "timeline_events_array",
    passed: Array.isArray(bundle.timeline),
    detail: `Timeline has ${bundle.timeline.length} entries`,
  });

  checks.push({
    name: "actions_array",
    passed: Array.isArray(bundle.actions),
    detail: `Actions has ${bundle.actions.length} entries`,
  });

  checks.push({
    name: "screenshots_array",
    passed: Array.isArray(bundle.screenshots),
    detail: `Screenshots has ${bundle.screenshots.length} entries`,
  });

  checks.push({
    name: "approvals_array",
    passed: Array.isArray(bundle.approvals),
    detail: `Approvals has ${bundle.approvals.length} entries`,
  });

  checks.push({
    name: "artifacts_array",
    passed: Array.isArray(bundle.artifacts),
    detail: `Artifacts has ${bundle.artifacts.length} entries`,
  });

  checks.push({
    name: "usage_summary_present",
    passed: bundle.usage !== null && typeof bundle.usage === "object",
    detail: "Usage summary is present",
  });

  checks.push({
    name: "status_present",
    passed: typeof bundle.status === "object" && typeof bundle.status.status === "string",
    detail: `Status: ${bundle.status.status}`,
  });

  checks.push({
    name: "limitations_present",
    passed: Array.isArray(bundle.limitations) && bundle.limitations.length > 0,
    detail: `${bundle.limitations.length} limitations documented`,
  });

  checks.push({
    name: "integrity_metadata_present",
    passed: typeof bundle.integrity === "object" && typeof bundle.integrity.disclaimer === "string",
    detail: "Integrity metadata with disclaimer present",
  });

  checks.push({
    name: "generated_at_timestamp",
    passed: typeof bundle.generatedAt === "string" && !isNaN(Date.parse(bundle.generatedAt)),
    detail: `Generated at: ${bundle.generatedAt}`,
  });

  checks.push({
    name: "no_fabricated_compliance_claims",
    passed: bundle.limitations.some(
      (l) => l.toLowerCase().includes("no cryptographic integrity") || l.toLowerCase().includes("not be treated as a forensic")
    ),
    detail: "Bundle explicitly disclaims cryptographic/forensic integrity",
  });

  checks.push({
    name: "no_secrets_in_bundle",
    passed:
      !JSON.stringify(bundle).toLowerCase().includes("password") &&
      !JSON.stringify(bundle).toLowerCase().includes("secret") &&
      !JSON.stringify(bundle).toLowerCase().includes("token"),
    detail: "Bundle does not contain password/secret/token fields",
  });

  const passed = checks.every((c) => c.passed);

  return { passed, checks };
}
