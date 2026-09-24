import { createHash, randomUUID } from "node:crypto";

export interface CanvasScope { organizationId: string; projectId: string; actorId: string; }
export interface DurableCanvasDocument { id: string; scope: CanvasScope; title: string; version: number; headHash: string; deletedAt: string | null; createdAt: string; updatedAt: string; }
export interface DurableCanvasOperation { id: string; documentId: string; scope: CanvasScope; sequence: number; parentHash: string; hash: string; operation: Readonly<Record<string, unknown>>; assetId: string | null; createdAt: string; }
export interface CanvasRepository { create(document: DurableCanvasDocument): Promise<void>; get(scope: CanvasScope, documentId: string): Promise<DurableCanvasDocument | null>; append(scope: CanvasScope, documentId: string, expectedVersion: number, operation: Omit<DurableCanvasOperation, "id" | "documentId" | "scope" | "sequence" | "parentHash" | "hash" | "createdAt">): Promise<DurableCanvasOperation | "conflict" | "not_found">; list(scope: CanvasScope, documentId: string): Promise<readonly DurableCanvasOperation[]>; }
function requireScope(scope: CanvasScope) { for (const value of Object.values(scope)) if (!value?.trim()) throw new Error("Canvas requires organization, project, and actor scope."); }
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export class DurableCanvasService {
  constructor(private readonly repository: CanvasRepository) {}
  async create(scope: CanvasScope, title: string) { requireScope(scope); if (!title.trim()) throw new Error("Canvas title is required."); const now = new Date().toISOString(); const document: DurableCanvasDocument = { id: randomUUID(), scope: { ...scope }, title, version: 0, headHash: hash({ document: title, scope: { organizationId: scope.organizationId, projectId: scope.projectId } }), deletedAt: null, createdAt: now, updatedAt: now }; await this.repository.create(document); return document; }
  async append(scope: CanvasScope, documentId: string, expectedVersion: number, operation: Omit<DurableCanvasOperation, "id" | "documentId" | "scope" | "sequence" | "parentHash" | "hash" | "createdAt">) { requireScope(scope); return this.repository.append(scope, documentId, expectedVersion, operation); }
}

/** Explicit test adapter; production must implement transactional RLS-scoped persistence. */
export class MemoryCanvasRepository implements CanvasRepository {
  private docs = new Map<string, DurableCanvasDocument>(); private ops = new Map<string, DurableCanvasOperation[]>();
  async create(document: DurableCanvasDocument) { this.docs.set(document.id, structuredClone(document)); this.ops.set(document.id, []); }
  async get(scope: CanvasScope, id: string) { const doc = this.docs.get(id); return doc && doc.scope.organizationId === scope.organizationId && doc.scope.projectId === scope.projectId && !doc.deletedAt ? structuredClone(doc) : null; }
  async append(scope: CanvasScope, id: string, expectedVersion: number, input: Omit<DurableCanvasOperation, "id" | "documentId" | "scope" | "sequence" | "parentHash" | "hash" | "createdAt">) {
    const doc = await this.get(scope, id); if (!doc) return "not_found"; if (doc.version !== expectedVersion) return "conflict";
    const operations = this.ops.get(id)!; const createdAt = new Date().toISOString(); const op: DurableCanvasOperation = { id: randomUUID(), documentId: id, scope: { ...scope }, sequence: operations.length + 1, parentHash: doc.headHash, operation: structuredClone(input.operation), assetId: input.assetId, createdAt, hash: "" }; op.hash = hash({ documentId: id, sequence: op.sequence, parentHash: op.parentHash, operation: op.operation, assetId: op.assetId, createdAt }); operations.push(op); doc.version++; doc.headHash = op.hash; doc.updatedAt = createdAt; this.docs.set(id, doc); return structuredClone(op);
  }
  async list(scope: CanvasScope, id: string) { return (await this.get(scope, id)) ? structuredClone(this.ops.get(id) ?? []) : []; }
}
