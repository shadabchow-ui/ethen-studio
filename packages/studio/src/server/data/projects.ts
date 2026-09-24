/** Studio V5 data — scoped project repository + idempotent default project (STUDIO_02). */
import "server-only";
import { randomUUID } from "node:crypto";
import type { CasResult, Pagination } from "../ports/repositories";
import { buildScope, sameScope, type ProjectScope } from "../../contracts/scope";
import { dataError } from "./types";
import type { Page, ProjectRecord } from "./types";
import { paginate } from "./pagination";

export interface EnsureDefaultProjectInput {
  tenantId: string;
  workspaceId: string;
  actorId: string;
  idempotencyKey: string;
  name?: string;
}

export interface ProjectRepository {
  get(scope: ProjectScope): Promise<ProjectRecord | null>;
  list(tenantId: string, page: Pagination, workspaceId?: string): Promise<Page<ProjectRecord>>;
  updateCas(
    scope: ProjectScope,
    expectedRevision: number,
    patch: { name?: string; settings?: Readonly<Record<string, unknown>> },
  ): Promise<CasResult<ProjectRecord>>;
  ensureDefaultProject(input: EnsureDefaultProjectInput): Promise<{ record: ProjectRecord; replayed: boolean }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw dataError("BAD_REQUEST", `${label} is required.`);
  }
  return value.trim();
}

function cleanName(name: string | undefined, fallback: string): string {
  const candidate = (name ?? fallback).trim();
  if (!candidate) throw dataError("BAD_REQUEST", "Project name is required.");
  if (candidate.length > 120) throw dataError("BAD_REQUEST", "Project name exceeds 120 characters.");
  return candidate;
}

/**
 * In-memory project repository. Scope map keys are tenant/workspace/project so
 * cross-tenant reads are structurally impossible; the SQL twin enforces the
 * same boundary with RLS + explicit scope predicates.
 */
export class MemoryProjectRepository implements ProjectRepository {
  private records = new Map<string, ProjectRecord>();
  /** Idempotency: (tenant, actor, key) -> projectId, mirroring the SQL unique. */
  private defaultKeys = new Map<string, string>();

  private key(scope: ProjectScope): string {
    return `${scope.tenantId}/${scope.workspaceId}/${scope.projectId}`;
  }

  async get(scope: ProjectScope): Promise<ProjectRecord | null> {
    return this.records.get(this.key(scope)) ?? null;
  }

  async list(tenantId: string, page: Pagination, workspaceId?: string): Promise<Page<ProjectRecord>> {
    requireNonEmpty(tenantId, "tenantId");
    const rows = [...this.records.values()]
      .filter((r) => r.tenantId === tenantId && (workspaceId === undefined || r.workspaceId === workspaceId))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return paginate(rows, page.limit, page.cursor);
  }

  async updateCas(
    scope: ProjectScope,
    expectedRevision: number,
    patch: { name?: string; settings?: Readonly<Record<string, unknown>> },
  ): Promise<CasResult<ProjectRecord>> {
    const current = this.records.get(this.key(scope));
    if (!current) return { ok: false, value: null, conflict: false };
    if (current.revision !== expectedRevision) return { ok: false, value: current, conflict: true };
    const updated: ProjectRecord = {
      ...current,
      name: patch.name !== undefined ? cleanName(patch.name, current.name) : current.name,
      settings: patch.settings !== undefined ? { ...patch.settings } : current.settings,
      revision: current.revision + 1,
      updatedAt: nowIso(),
    };
    this.records.set(this.key(scope), updated);
    return { ok: true, value: updated, conflict: false };
  }

  async ensureDefaultProject(input: EnsureDefaultProjectInput): Promise<{ record: ProjectRecord; replayed: boolean }> {
    const tenantId = requireNonEmpty(input.tenantId, "tenantId");
    const workspaceId = requireNonEmpty(input.workspaceId, "workspaceId");
    const actorId = requireNonEmpty(input.actorId, "actorId");
    const idempotencyKey = requireNonEmpty(input.idempotencyKey, "idempotencyKey");
    // Synchronous critical section: Map check-then-insert runs to completion
    // without interleaving, so concurrent same-key calls converge on one row
    // (the SQL twin converges on the unique index instead).
    const key = `${tenantId}:${actorId}:${idempotencyKey}`;
    const existingId = this.defaultKeys.get(key);
    if (existingId) {
      for (const record of this.records.values()) {
        if (record.projectId === existingId && record.tenantId === tenantId) {
          return { record, replayed: true };
        }
      }
      // Key won but row is gone: fall through and recreate under the same key.
    }
    const at = nowIso();
    const record: ProjectRecord = {
      projectId: randomUUID(),
      tenantId,
      workspaceId,
      name: cleanName(input.name, "Untitled project"),
      revision: 1,
      isDefault: true,
      settings: {},
      createdAt: at,
      updatedAt: at,
    };
    const scope = buildScope(tenantId, workspaceId, record.projectId);
    this.records.set(this.key(scope), record);
    this.defaultKeys.set(key, record.projectId);
    return { record, replayed: false };
  }
}

/** Seed helper for tests/consumers: insert a project row directly. */
export function seedProject(repo: MemoryProjectRepository, record: ProjectRecord): ProjectScope {
  const scope = buildScope(record.tenantId, record.workspaceId, record.projectId);
  (repo as unknown as { records: Map<string, ProjectRecord> }).records.set(
    `${scope.tenantId}/${scope.workspaceId}/${scope.projectId}`,
    { ...record },
  );
  return scope;
}

export function assertSameScope(recordScope: ProjectScope, scope: ProjectScope): void {
  if (!sameScope(recordScope, scope)) {
    throw dataError("FORBIDDEN", "Record does not belong to the requested project scope.");
  }
}
