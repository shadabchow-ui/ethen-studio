import "server-only";

import type { AuditLogEntry, AuditEventType } from "./platform-types";
import { hashAuditEvent, signAuditPayload, verifyAuditChain } from "./platform-integrity";
function governanceRepositoryMode(): "durable" | "memory" {
  const mode = process.env.ETHEN_GOVERNANCE_REPOSITORY_MODE;
  if (mode === "test" || mode === "demo") return "memory";
  return "durable";
}

/**
 * In-memory audit log service.
 * Used as fallback when Supabase is not configured.
 * Data is ephemeral (process lifetime only).
 */
export class MemoryAuditLogService {
  private entries: AuditLogEntry[] = [];

  /** List all audit entries, optionally filtered. */
  listAuditLog(options?: {
    trace?: string;
    workflow?: string;
    limit?: number;
  }): AuditLogEntry[] {
    let result = [...this.entries];

    if (options?.trace) {
      result = result.filter((e) => e.traceId === options.trace);
    }

    if (options?.workflow) {
      result = result.filter((e) =>
        e.metadata?.workflowId === options.workflow,
      );
    }

    // Sort by timestamp descending (newest first)
    result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (options?.limit && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /** Get a single audit entry by id. */
  getAuditEntry(id: string): AuditLogEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** Append an audit entry. */
  recordEntry(entry: AuditLogEntry): void {
    const previousHash = this.entries.at(-1)?.entryHash ?? null;
    const chained = { ...entry, previousHash };
    this.entries.push({ ...chained, entryHash: hashAuditEvent(chained) });
  }

  /** Generate a signed export bundle. */
  generateExport(commitSha?: string): {
    entries: AuditLogEntry[];
    exportedAt: string;
    commitSha: string;
    signature: string | null;
    signatureStatus: "signed" | "unsigned";
    chainVerified: boolean;
    totalEntries: number;
  } {
    const sorted = [...this.entries].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    const exportedAt = new Date().toISOString();
    const sha = commitSha ?? "HEAD";
    const chain = verifyAuditChain(sorted);
    const payload = JSON.stringify({ exportedAt, commitSha: sha, entries: sorted });
    const signing = signAuditPayload(payload, process.env.ETHEN_AUDIT_SIGNING_KEY);

    return {
      entries: sorted,
      exportedAt,
      commitSha: sha,
      signature: signing.signature,
      signatureStatus: signing.status,
      chainVerified: chain.valid,
      totalEntries: sorted.length,
    };
  }

  /** Seed only when an explicit demo/test harness invokes this method. */
  seedSampleEntries(): void {
    if (this.entries.length > 0) return; // Already seeded

    const base = "2026-07-27T";
    const entries: AuditLogEntry[] = [
      {
        id: "audit_plat_001",
        eventType: "workflow_run_started",
        actor: { id: "user_sha", label: "sha" },
        projectId: "proj_demo",
        target: {
          kind: "workflow_run",
          id: "run_demo_001",
          label: "Demo workflow run",
        },
        decision: null,
        traceId: "trace_demo_001",
        timestamp: `${base}10:00:00.000Z`,
        sample: true,
        metadata: { trigger: "manual" },
      },
      {
        id: "audit_plat_002",
        eventType: "approval_requested",
        actor: { id: "user_workflow", label: "Workflow Runner" },
        projectId: "proj_demo",
        target: {
          kind: "approval_request",
          id: "apr_demo_pending_1",
          label: "Append row to Google Sheets",
        },
        decision: null,
        traceId: "trace_demo_001",
        timestamp: `${base}10:00:01.000Z`,
        sample: true,
        metadata: { riskTier: "writes_data" },
      },
      {
        id: "audit_plat_003",
        eventType: "policy_decision",
        actor: { id: null, label: "policy:policy_default_safe" },
        projectId: "proj_demo",
        target: {
          kind: "workflow_step",
          id: "step_sheets_append",
          label: "Append row to Google Sheets",
        },
        decision: "approval_required",
        traceId: "trace_demo_001",
        timestamp: `${base}10:00:02.000Z`,
        sample: true,
        metadata: { profileId: "policy_default_safe" },
      },
      {
        id: "audit_plat_004",
        eventType: "approval_approved",
        actor: { id: "user_sha", label: "sha" },
        projectId: "proj_demo",
        target: {
          kind: "approval_request",
          id: "apr_demo_approved_1",
          label: "Create Linear issue",
        },
        decision: "approved",
        traceId: "trace_demo_002",
        timestamp: `${base}10:05:00.000Z`,
        sample: true,
        metadata: { riskTier: "writes_data" },
      },
      {
        id: "audit_plat_005",
        eventType: "workflow_step_completed",
        actor: { id: "user_sha", label: "sha" },
        projectId: "proj_demo",
        target: {
          kind: "workflow_step",
          id: "step_linear_create",
          label: "Create Linear issue",
        },
        decision: "completed",
        traceId: "trace_demo_002",
        timestamp: `${base}10:05:30.000Z`,
        sample: true,
        metadata: { retryCount: 0 },
      },
      {
        id: "audit_plat_006",
        eventType: "approval_rejected",
        actor: { id: "user_sha", label: "sha" },
        projectId: "proj_demo",
        target: {
          kind: "approval_request",
          id: "apr_demo_rejected_1",
          label: "Post to Slack channel",
        },
        decision: "rejected",
        traceId: "trace_demo_003",
        timestamp: `${base}11:00:00.000Z`,
        sample: true,
        metadata: {
          riskTier: "external_effect",
          reason: "External communication requires manager approval.",
        },
      },
      {
        id: "audit_plat_007",
        eventType: "action_executed",
        actor: { id: "user_workflow", label: "Workflow Runner" },
        projectId: "proj_demo",
        target: {
          kind: "tool_call",
          id: "tool_demo_001",
          label: "Google Sheets append_row",
        },
        decision: "completed",
        traceId: "trace_demo_004",
        timestamp: `${base}12:00:00.000Z`,
        sample: true,
        metadata: { rowsAffected: 1 },
      },
      {
        id: "audit_plat_008",
        eventType: "action_blocked",
        actor: { id: null, label: "system:tool_registry" },
        projectId: null,
        target: {
          kind: "tool_call",
          id: "tool_unknown",
          label: "Unknown tool execution attempt",
        },
        decision: "blocked",
        traceId: null,
        timestamp: `${base}12:30:00.000Z`,
        sample: true,
        metadata: { reason: "tool_not_in_registry" },
      },
    ];

    for (const entry of entries) this.recordEntry(entry);
  }
}

// Singleton instance
let instance: MemoryAuditLogService | null = null;

export function getAuditLogService(): MemoryAuditLogService {
  if (governanceRepositoryMode() !== "memory") {
    throw new Error("durable audit storage is required; memory audit storage is test/demo only");
  }
  if (!instance) {
    instance = new MemoryAuditLogService();
  }
  return instance;
}
