import "server-only";

import type {
  ComputerUseRun,
  ComputerUseRunStatus,
  ComputerUseStep,
  ComputerUseScreenshot,
  ComputerUseApproval,
  ComputerUseArtifact,
  ComputerUseObservation,
  ComputerUseReplayEvent,
  ComputerAction,
  PermissionScope,
  SandboxSession,
} from "./types";
import type {
  ComputerUseStorageAdapter,
  ComputerUseRunStore,
  ComputerUseStepStore,
  ComputerUseScreenshotStore,
  ComputerUseApprovalStore,
  ComputerUseArtifactStore,
  ComputerUseObservationStore,
  ComputerUseEventStore,
  ComputerUseStorageKind,
  CreateRunStoreInput,
  ComputerUseRunAccessScope,
} from "./storage";
import {
  computeCanonicalActionIdentity,
  computePayloadHash,
  derivePayloadPreview,
  deriveTargetDomain,
  APPROVAL_EXPIRY_MINUTES,
} from "./store";
import { createServiceClient } from "@ethen/database/service";
import {
  uploadTenantObject,
  generateSignedUrl,
} from "@ethen/database/storage/tenant-object-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

function getDb(): SupabaseClient | null {
  return createServiceClient();
}

function supabaseOk(): boolean {
  return getDb() !== null;
}

// ── Row ↔ type mapping ──────────────────────────────────────────────────────

function runToRow(run: ComputerUseRun): Record<string, unknown> {
  return {
    id: run.id,
    user_id: run.userId,
    org_id: run.orgId ?? null,
    project_id: run.projectId ?? null,
    title: run.title,
    mode: run.mode,
    provider: run.provider,
    status: run.status,
    task: run.task,
    task_brief: run.taskBrief,
    permission_scope: run.permissionScope,
    sandbox: run.sandbox,
    current_step_id: run.currentStepId ?? null,
    step_count: run.stepCount,
    max_steps: run.maxSteps,
    cost_estimate: run.costEstimate ?? null,
    summary: run.summary ?? null,
    result_status: run.resultStatus ?? null,
    started_at: run.startedAt,
    completed_at: run.completedAt ?? null,
  };
}

function rowToRun(row: Record<string, unknown>): ComputerUseRun {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    orgId: row.org_id as string | undefined,
    projectId: row.project_id as string | undefined,
    title: row.title as string,
    mode: row.mode as ComputerUseRun["mode"],
    provider: row.provider as ComputerUseRun["provider"],
    status: row.status as ComputerUseRunStatus,
    task: row.task as string,
    taskBrief: row.task_brief as ComputerUseRun["taskBrief"],
    permissionScope: row.permission_scope as PermissionScope,
    sandbox: row.sandbox as SandboxSession,
    currentStepId: row.current_step_id as string | undefined,
    stepCount: row.step_count as number,
    maxSteps: row.max_steps as number,
    costEstimate: row.cost_estimate as ComputerUseRun["costEstimate"],
    summary: row.summary as string | undefined,
    resultStatus: row.result_status as ComputerUseRun["resultStatus"],
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | undefined,
  };
}

function stepToRow(step: Omit<ComputerUseStep, "id"> & { id?: string }): Record<string, unknown> {
  return {
    id: step.id,
    run_id: step.runId,
    index: step.index,
    status: step.status,
    action: step.action,
    result: step.result ?? null,
    policy_decision: step.policyDecision ?? null,
    before_screenshot_id: step.beforeScreenshotId ?? null,
    after_screenshot_id: step.afterScreenshotId ?? null,
    started_at: step.startedAt,
    completed_at: step.completedAt ?? null,
  };
}

function rowToStep(row: Record<string, unknown>): ComputerUseStep {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    index: row.index as number,
    status: row.status as ComputerUseStep["status"],
    action: row.action as ComputerAction,
    result: row.result as ComputerUseStep["result"],
    policyDecision: row.policy_decision as ComputerUseStep["policyDecision"],
    beforeScreenshotId: row.before_screenshot_id as string | undefined,
    afterScreenshotId: row.after_screenshot_id as string | undefined,
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | undefined,
  };
}

function screenshotToRow(s: ComputerUseScreenshot): Record<string, unknown> {
  return {
    id: s.id,
    run_id: s.runId,
    step_id: s.stepId ?? null,
    captured_at: s.capturedAt,
    original_width: s.originalWidth,
    original_height: s.originalHeight,
    sent_width: s.sentWidth,
    sent_height: s.sentHeight,
    scale_x: s.scaleX,
    scale_y: s.scaleY,
    device_pixel_ratio: s.devicePixelRatio,
    image_uri: s.imageUri,
    hash: s.hash,
    label: s.label ?? null,
  };
}

function rowToScreenshot(row: Record<string, unknown>): ComputerUseScreenshot {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    stepId: row.step_id as string | undefined,
    capturedAt: row.captured_at as string,
    originalWidth: row.original_width as number,
    originalHeight: row.original_height as number,
    sentWidth: row.sent_width as number,
    sentHeight: row.sent_height as number,
    scaleX: row.scale_x as number,
    scaleY: row.scale_y as number,
    devicePixelRatio: row.device_pixel_ratio as number,
    imageUri: row.image_uri as string,
    hash: row.hash as string,
    label: row.label as string | undefined,
  };
}

function approvalToRow(a: ComputerUseApproval): Record<string, unknown> {
  return {
    id: a.id,
    run_id: a.runId,
    step_id: a.stepId,
    requested_at: a.requestedAt,
    resolved_at: a.resolvedAt ?? null,
    requested_by: a.requestedBy,
    resolved_by: a.resolvedBy ?? null,
    decision: a.decision ?? null,
    action: a.action,
    risk_level: a.riskLevel,
    reason: a.reason,
    screenshot_before_id: a.screenshotBeforeId ?? null,
    redaction_applied: a.redactionApplied,
    payload_identity: a.payloadIdentity ?? null,
  };
}

function rowToApproval(row: Record<string, unknown>): ComputerUseApproval {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    stepId: row.step_id as string,
    requestedAt: row.requested_at as string,
    resolvedAt: row.resolved_at as string | undefined,
    requestedBy: row.requested_by as ComputerUseApproval["requestedBy"],
    resolvedBy: row.resolved_by as string | undefined,
    decision: row.decision as ComputerUseApproval["decision"],
    action: row.action as ComputerAction,
    riskLevel: row.risk_level as ComputerUseApproval["riskLevel"],
    reason: row.reason as string,
    screenshotBeforeId: row.screenshot_before_id as string | undefined,
    redactionApplied: row.redaction_applied as boolean,
    payloadIdentity: row.payload_identity as string | undefined,
  };
}

function observationToRow(o: ComputerUseObservation): Record<string, unknown> {
  return {
    run_id: o.runId,
    step_id: o.stepId,
    timestamp: o.timestamp,
    environment: o.environment,
    url: o.url ?? null,
    screenshot: o.screenshot ?? null,
    viewport: o.viewport,
    visible_text: o.visibleText ?? null,
    network_state: o.networkState ?? null,
    browser_session_mode: o.browserSessionMode ?? null,
    trust_level: o.trustLevel ?? null,
  };
}

function rowToObservation(row: Record<string, unknown>): ComputerUseObservation {
  return {
    runId: row.run_id as string,
    stepId: row.step_id as string,
    timestamp: row.timestamp as string,
    environment: row.environment as ComputerUseObservation["environment"],
    url: row.url as string | undefined,
    screenshot: row.screenshot as ComputerUseScreenshot | undefined,
    viewport: row.viewport as { width: number; height: number; deviceScaleFactor?: number },
    visibleText: row.visible_text as string | undefined,
    networkState: row.network_state as ComputerUseObservation["networkState"],
    browserSessionMode: row.browser_session_mode as ComputerUseObservation["browserSessionMode"],
    trustLevel: row.trust_level as ComputerUseObservation["trustLevel"],
  };
}

function eventToRow(e: Omit<ComputerUseReplayEvent, "id"> & { id?: string }): Record<string, unknown> {
  return {
    id: e.id,
    run_id: e.runId,
    step_id: e.stepId ?? null,
    type: e.type,
    timestamp: e.timestamp,
    actor: e.actor,
    screenshot_id: e.screenshotId ?? null,
    action: e.action ?? null,
    result: e.result ?? null,
    policy_decision: e.policyDecision ?? null,
    step: e.step ?? null,
    metadata: e.metadata ?? null,
  };
}

function rowToEvent(row: Record<string, unknown>): ComputerUseReplayEvent {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    stepId: row.step_id as string | undefined,
    type: row.type as ComputerUseReplayEvent["type"],
    timestamp: row.timestamp as string,
    actor: row.actor as ComputerUseReplayEvent["actor"],
    screenshotId: row.screenshot_id as string | undefined,
    action: row.action as ComputerUseReplayEvent["action"],
    result: row.result as ComputerUseReplayEvent["result"],
    policyDecision: row.policy_decision as ComputerUseReplayEvent["policyDecision"],
    step: row.step as ComputerUseReplayEvent["step"],
    metadata: row.metadata as ComputerUseReplayEvent["metadata"],
  };
}

function artifactToRow(a: Omit<ComputerUseArtifact, "id" | "createdAt" | "runId"> & { id?: string }): Record<string, unknown> {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    uri: a.uri,
    content_type: a.contentType,
    size_bytes: a.sizeBytes,
    hash: a.hash,
    redacted: a.redacted,
  };
}

function rowToArtifact(row: Record<string, unknown>): ComputerUseArtifact {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    type: row.type as ComputerUseArtifact["type"],
    title: row.title as string,
    uri: row.uri as string,
    contentType: row.content_type as string,
    sizeBytes: row.size_bytes as number,
    hash: row.hash as string,
    redacted: row.redacted as boolean,
    createdAt: row.created_at as string,
  };
}

// ── Store implementations ───────────────────────────────────────────────────

function makeSupabaseRunStore(): ComputerUseRunStore {
  return {
    async create(input: CreateRunStoreInput): Promise<ComputerUseRun> {
      const db = getDb();
      if (!db) throw new Error("Supabase client unavailable — cannot create run.");
      const id = `cu-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const scope: PermissionScope = {
        accessMode: "guided-browser",
        domainPolicyMode: "restricted",
        allowedDomains: input.allowedDomains ?? [],
        blockedDomains: [],
        allowedActions: ["screenshot", "click", "type", "scroll", "navigate", "wait", "extractText", "extractLinks", "extractHeadings", "extractTable"],
        approvalRequiredActions: ["navigate", "click", "type"],
        blockedActions: [],
        credentialMode: "none",
        fileSystemScope: "none",
        networkMode: "allowlist",
        dataRetention: "session-only",
        maxSteps: input.maxSteps ?? 40,
        maxRuntimeMinutes: 15,
      };

      const sandbox: SandboxSession = {
        sandboxId: `${id}-sandbox`,
        mode: input.mode ?? "browser",
        status: "creating",
        viewport: { width: 1280, height: 720, scale: 1 },
        createdAt: now,
        ...input.sandbox,
      };

      const run: ComputerUseRun = {
        id,
        userId: input.userId,
        orgId: input.orgId,
        projectId: input.projectId,
        title: input.title,
        mode: input.mode ?? "browser",
        provider: "playwright",
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
        permissionScope: { ...scope, ...input.permissionScope },
        sandbox,
        stepCount: 0,
        maxSteps: scope.maxSteps,
        startedAt: now,
      };

      const { error } = await db.from("computer_use_runs").insert(runToRow(run));
      if (error) throw new Error(`Failed to create run: ${error.message}`);
      return run;
    },

    async get(id: string): Promise<ComputerUseRun | null> {
      const db = getDb();
      if (!db) return null;
      const { data, error } = await db.from("computer_use_runs").select("*").eq("id", id).maybeSingle();
      if (error || !data) return null;
      return rowToRun(data as Record<string, unknown>);
    },

    async setStatus(id: string, status: ComputerUseRunStatus): Promise<ComputerUseRun | null> {
      const db = getDb();
      if (!db) return null;
      const updates: Record<string, unknown> = { status };
      if (status === "complete" || status === "failed" || status === "cancelled" || status === "timed_out") {
        updates.completed_at = new Date().toISOString();
      }
      const { error } = await db.from("computer_use_runs").update(updates).eq("id", id);
      if (error) return null;
      const { data } = await db.from("computer_use_runs").select("*").eq("id", id).maybeSingle();
      if (!data) return null;
      return rowToRun(data as Record<string, unknown>);
    },

    async update(id: string, data: Partial<ComputerUseRun>): Promise<ComputerUseRun | null> {
      const db = getDb();
      if (!db) return null;
      const row = runToRow(data as ComputerUseRun);
      const { error } = await db.from("computer_use_runs").update(row).eq("id", id);
      if (error) return null;
      return this.get(id);
    },

    async list(scope?: ComputerUseRunAccessScope): Promise<ComputerUseRun[]> {
      const db = getDb();
      if (!db) return [];
      if (!scope && process.env.NODE_ENV === "production") {
        throw new Error("Computer Use service-role listing requires an explicit actor scope.");
      }
      let query = db.from("computer_use_runs").select("*").order("created_at", { ascending: false });
      if (scope) {
        query = query.eq("user_id", scope.actorId);
        if (scope.projectId) query = query.eq("project_id", scope.projectId);
      }
      const { data, error } = await query;
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map(rowToRun);
    },

    async updateSandbox(id: string, update: Partial<SandboxSession>): Promise<ComputerUseRun | null> {
      const db = getDb();
      if (!db) return null;
      const existing = await this.get(id);
      if (!existing) return null;
      const mergedSandbox = { ...existing.sandbox, ...update };
      const { error } = await db.from("computer_use_runs").update({ sandbox: mergedSandbox }).eq("id", id);
      if (error) return null;
      return this.get(id);
    },

    reset(): void {},
  };
}

function makeSupabaseStepStore(): ComputerUseStepStore {
  return {
    async add(runId: string, step: Omit<ComputerUseStep, "id"> & { id?: string }): Promise<ComputerUseStep> {
      const db = getDb();
      if (!db) throw new Error("Supabase client unavailable — cannot add step.");
      const id = step.id ?? `cu-step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { error } = await db.from("computer_use_steps").insert(stepToRow({ ...step, id }));
      if (error) throw new Error(`Failed to add step: ${error.message}`);
      return rowToStep(stepToRow({ ...step, id }));
    },

    async getByRun(runId: string): Promise<ComputerUseStep[]> {
      const db = getDb();
      if (!db) return [];
      const { data, error } = await db.from("computer_use_steps").select("*").eq("run_id", runId).order("index", { ascending: true });
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map(rowToStep);
    },

    async updateStatus(stepId: string, status: ComputerUseStep["status"], extra?: Partial<ComputerUseStep>): Promise<ComputerUseStep | null> {
      const db = getDb();
      if (!db) return null;
      const updates: Record<string, unknown> = { status, ...(extra ? stepToRow(extra as ComputerUseStep) : {}) };
      if (status === "executed" || status === "failed" || status === "blocked") {
        updates.completed_at = new Date().toISOString();
      }
      const { error } = await db.from("computer_use_steps").update(updates).eq("id", stepId);
      if (error) return null;
      const { data } = await db.from("computer_use_steps").select("*").eq("id", stepId).maybeSingle();
      if (!data) return null;
      return rowToStep(data as Record<string, unknown>);
    },

    reset(): void {},
  };
}

function makeSupabaseScreenshotStore(): ComputerUseScreenshotStore {
  return {
    async add(runId: string, screenshot: ComputerUseScreenshot): Promise<ComputerUseScreenshot> {
      const db = getDb();
      if (!db) throw new Error("Supabase client unavailable — cannot add screenshot.");

      // Determine if imageUri is a data URI (inline) or already a reference URL
      const isDataUri = screenshot.imageUri.startsWith("data:");

      if (isDataUri) {
        // Migrate inline data URI to tenant-scoped object storage.
        // Derive project context from the run record.
        const { data: runRow } = await db
          .from("computer_use_runs")
          .select("user_id")
          .eq("id", runId)
          .maybeSingle();

        if (!runRow) {
          throw new Error(`Cannot add screenshot: run ${runId} not found.`);
        }

        const userId = (runRow as Record<string, unknown>).user_id as string;

        // Decode base64 data URI to bytes
        const match = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(screenshot.imageUri);
        if (!match) throw new Error("Screenshot must be a data URI with image/png, image/jpeg, or image/webp.");

        const mediaType = match[1];
        const extension = match[2] === "jpeg" ? "jpg" : match[2];
        const base64Data = match[3].replace(/\s/g, "");
        const bytes = Buffer.from(base64Data, "base64");

        const filename = `${screenshot.id}.${extension}`;

        const projectId = (runRow as Record<string, unknown>).project_id as string | null;
        if (!projectId) throw new Error("Cannot store screenshot evidence for a run without a project scope.");

        const { signedUrl } = await uploadTenantObject({
          projectId,
          actorId: userId,
          bytes,
          contentType: mediaType,
          filename,
          source: "computer-use",
          retentionDays: 30, // default 30-day retention for screenshots
        });

        // Replace inline data URI with the signed URL
        const storageRef = screenshot;
        storageRef.imageUri = signedUrl;

        const { error } = await db.from("computer_use_screenshots").insert(screenshotToRow(storageRef));
        if (error) throw new Error(`Failed to add screenshot: ${error.message}`);
        return storageRef;
      }

      // Not a data URI — store as-is (already a URL or external reference)
      const { error } = await db.from("computer_use_screenshots").insert(screenshotToRow(screenshot));
      if (error) throw new Error(`Failed to add screenshot: ${error.message}`);
      return screenshot;
    },

    async getByRun(runId: string): Promise<ComputerUseScreenshot[]> {
      const db = getDb();
      if (!db) return [];
      const { data, error } = await db.from("computer_use_screenshots").select("*").eq("run_id", runId).order("captured_at", { ascending: true });
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map(rowToScreenshot);
    },

    reset(): void {},
  };
}

function makeSupabaseApprovalStore(): ComputerUseApprovalStore {
  return {
    async add(runId: string, input: {
      stepId: string;
      action: ComputerAction;
      riskLevel: ComputerUseApproval["riskLevel"];
      reason: string;
    }): Promise<ComputerUseApproval | null> {
      const db = getDb();
      if (!db) return null;
      const id = `cu-approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      // CU-P0-07 (APPROVAL-AUTHORITY-MERGE-01): the durable path must bind the
      // exact canonical action identity + payload hash exactly like the
      // in-memory path (store.ts requestApproval) — otherwise the durable
      // approval silently loses the exact-action binding that resolve()
      // re-verifies.
      const identity = computeCanonicalActionIdentity(input.action);
      const approval: ComputerUseApproval = {
        id,
        runId,
        stepId: input.stepId,
        requestedAt: now,
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
      const { error } = await db.from("computer_use_approvals").insert(approvalToRow(approval));
      if (error) return null;
      return approval;
    },

    async getByRun(runId: string): Promise<ComputerUseApproval[]> {
      const db = getDb();
      if (!db) return [];
      const { data, error } = await db.from("computer_use_approvals").select("*").eq("run_id", runId).order("requested_at", { ascending: true });
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map(rowToApproval);
    },

    async getPending(runId: string): Promise<ComputerUseApproval[]> {
      const db = getDb();
      if (!db) return [];
      const { data, error } = await db.from("computer_use_approvals").select("*").eq("run_id", runId).is("decision", null).order("requested_at", { ascending: true });
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map(rowToApproval);
    },

    async resolve(
      approvalId: string,
      decision: "approved" | "denied" | "expired",
      resolvedBy?: string,
    ): Promise<ComputerUseApproval | null> {
      const db = getDb();
      if (!db) return null;
      const now = new Date().toISOString();
      const { data: existing } = await db.from("computer_use_approvals").select("*").eq("id", approvalId).maybeSingle();
      if (!existing) return null;
      if ((existing as Record<string, unknown>).decision) return null;
      const { error } = await db.from("computer_use_approvals").update({
        decision,
        resolved_at: now,
        resolved_by: resolvedBy ?? "user",
      }).eq("id", approvalId);
      if (error) return null;
      const { data } = await db.from("computer_use_approvals").select("*").eq("id", approvalId).maybeSingle();
      if (!data) return null;
      return rowToApproval(data as Record<string, unknown>);
    },

    reset(): void {},
  };
}

function makeSupabaseArtifactStore(): ComputerUseArtifactStore {
  return {
    async add(
      runId: string,
      artifact: Omit<ComputerUseArtifact, "id" | "createdAt" | "runId"> & { id?: string },
    ): Promise<ComputerUseArtifact | null> {
      const db = getDb();
      if (!db) return null;
      const id = artifact.id ?? `cu-artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const row = { ...artifactToRow(artifact), id, run_id: runId };
      const { error } = await db.from("computer_use_artifacts").insert(row);
      if (error) return null;
      const { data } = await db.from("computer_use_artifacts").select("*").eq("id", id).maybeSingle();
      if (!data) return null;
      return rowToArtifact(data as Record<string, unknown>);
    },

    async getByRun(runId: string): Promise<ComputerUseArtifact[]> {
      const db = getDb();
      if (!db) return [];
      const { data, error } = await db.from("computer_use_artifacts").select("*").eq("run_id", runId).order("created_at", { ascending: true });
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map(rowToArtifact);
    },

    reset(): void {},
  };
}

function makeSupabaseObservationStore(): ComputerUseObservationStore {
  let obsCounter = 0;

  return {
    async add(runId: string, observation: ComputerUseObservation): Promise<ComputerUseObservation> {
      const db = getDb();
      if (!db) throw new Error("Supabase client unavailable — cannot add observation.");
      const id = `cu-obs-${Date.now()}-${++obsCounter}`;
      const row = { ...observationToRow(observation), id, run_id: runId };
      const { error } = await db.from("computer_use_observations").insert(row);
      if (error) throw new Error(`Failed to add observation: ${error.message}`);
      return observation;
    },

    async getByRun(runId: string): Promise<ComputerUseObservation[]> {
      const db = getDb();
      if (!db) return [];
      const { data, error } = await db.from("computer_use_observations").select("*").eq("run_id", runId).order("timestamp", { ascending: true });
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map(rowToObservation);
    },

    reset(): void { obsCounter = 0; },
  };
}

function makeSupabaseEventStore(): ComputerUseEventStore {
  return {
    async add(
      runId: string,
      event: Omit<ComputerUseReplayEvent, "id"> & { id?: string },
    ): Promise<ComputerUseReplayEvent> {
      const db = getDb();
      if (!db) throw new Error("Supabase client unavailable — cannot add event.");
      const id = event.id ?? `cu-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { error } = await db.from("computer_use_events").insert(eventToRow({ ...event, id }));
      if (error) throw new Error(`Failed to add event: ${error.message}`);
      return rowToEvent(eventToRow({ ...event, id }));
    },

    async getByRun(runId: string): Promise<ComputerUseReplayEvent[]> {
      const db = getDb();
      if (!db) return [];
      const { data, error } = await db.from("computer_use_events").select("*").eq("run_id", runId).order("timestamp", { ascending: true });
      if (error || !data) return [];
      return (data as Record<string, unknown>[]).map(rowToEvent);
    },

    reset(): void {},
  };
}

// ── Factory and readiness ───────────────────────────────────────────────────

export interface SupabaseAdapterReadiness {
  ready: boolean;
  reason: string;
}

export function createSupabaseComputerUseAdapter(): ComputerUseStorageAdapter {
  return {
    kind: "supabase" as ComputerUseStorageKind,
    runs: makeSupabaseRunStore(),
    steps: makeSupabaseStepStore(),
    screenshots: makeSupabaseScreenshotStore(),
    approvals: makeSupabaseApprovalStore(),
    artifacts: makeSupabaseArtifactStore(),
    observations: makeSupabaseObservationStore(),
    events: makeSupabaseEventStore(),
    reset(): void {},
  };
}

export function getSupabaseAdapterReadiness(): SupabaseAdapterReadiness {
  const db = getDb();
  if (!db) {
    return {
      ready: false,
      reason: "Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are not configured.",
    };
  }
  return {
    ready: true,
    reason: "Supabase service client is configured. Tables must be provisioned via migration 0016.",
  };
}
