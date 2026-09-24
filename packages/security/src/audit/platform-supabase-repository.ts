import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogEntry } from "./platform-types";
import { hashAuditEvent } from "./platform-integrity";

function detail(error: unknown): string {
  return error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
}

function fromRow(row: Record<string, unknown>): AuditLogEntry {
  return {
    id: String(row.id), eventType: row.event_type as AuditLogEntry["eventType"],
    actor: { id: row.actor_id as string | null, label: String(row.actor_label ?? "") },
    projectId: row.project_id as string | null,
    target: { kind: String(row.target_kind ?? ""), id: String(row.target_id ?? ""), label: String(row.target_label ?? "") },
    decision: row.decision as string | null, traceId: row.trace_id as string | null,
    timestamp: String(row.timestamp), sample: Boolean(row.sample),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    previousHash: row.previous_hash as string | null, entryHash: row.entry_hash as string | undefined,
  };
}

export class SupabaseAuditLogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async list(projectId: string, options?: { trace?: string; workflow?: string; limit?: number }): Promise<AuditLogEntry[]> {
    let query = this.client.from("audit_log").select("*").eq("project_id", projectId).order("timestamp", { ascending: true }).order("id", { ascending: true });
    if (options?.trace) query = query.eq("trace_id", options.trace);
    if (options?.workflow) query = query.contains("metadata", { workflowId: options.workflow });
    if (options?.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw new Error(`audit storage read failed: ${detail(error)}`);
    return (data ?? []).map((item) => fromRow(item as Record<string, unknown>));
  }

  async append(entry: AuditLogEntry): Promise<AuditLogEntry> {
    const prior = await this.client.from("audit_log").select("entry_hash").eq("project_id", entry.projectId ?? "").order("timestamp", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (prior.error) throw new Error(`audit storage read failed: ${detail(prior.error)}`);
    const chained = { ...entry, previousHash: (prior.data?.entry_hash as string | null) ?? null };
    const persisted = { ...chained, entryHash: hashAuditEvent(chained) };
    const { error } = await this.client.from("audit_log").insert({
      id: persisted.id, event_type: persisted.eventType, actor_id: persisted.actor.id, actor_label: persisted.actor.label,
      project_id: persisted.projectId, target_kind: persisted.target.kind, target_id: persisted.target.id,
      target_label: persisted.target.label, decision: persisted.decision, trace_id: persisted.traceId,
      metadata: persisted.metadata, sample: persisted.sample, timestamp: persisted.timestamp,
      previous_hash: persisted.previousHash, entry_hash: persisted.entryHash,
    });
    if (error) throw new Error(`audit storage write failed: ${detail(error)}`);
    return persisted;
  }
}
