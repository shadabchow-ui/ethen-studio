import { createHash } from "node:crypto";
import type { RetrievalChunk } from "./types";

/**
 * P11 — canonical context-set identity, classification, and cross-product rules.
 *
 * A context set is the frozen, stable-identity record of what retrieval/
 * context an execution attempt actually consumed: version-pinned source
 * references plus the provenance needed to reconstruct them. It converges
 * existing authorities (documents, versions, chunks, citations, grounding,
 * permissions) without replacing any of them.
 *
 * Memory is context, not operational truth: every item carries an authority
 * classification, and memory-classified items are mechanically refused
 * wherever operational facts are required.
 */

export type ProductDomain = "core" | "founder" | "bot";

export type ContextAuthorityClass =
  | "MEMORY_CONTEXT"
  | "RETRIEVED_CONTEXT"
  | "AUTHORITATIVE_CONTEXT";

export interface ContextSetItem {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  projectId: string;
  rank: number | null;
  score: number | null;
  citationId: string | null;
  classification: ContextAuthorityClass;
  originProduct: ProductDomain;
  permissionNote: string | null;
}

export interface ContextSet {
  id: string;
  projectId: string;
  originProduct: ProductDomain;
  items: readonly ContextSetItem[];
  traceId: string | null;
  runId: string | null;
  attemptId: string | null;
  createdAt: string;
}

export interface BuildContextSetInput {
  projectId: string;
  originProduct: ProductDomain;
  items: ReadonlyArray<{
    chunk: RetrievalChunk;
    documentId: string;
    documentVersionId: string;
    rank?: number | null;
    score?: number | null;
    citationId?: string | null;
    classification: ContextAuthorityClass;
    originProduct?: ProductDomain;
    permissionNote?: string | null;
  }>;
  traceId?: string | null;
  runId?: string | null;
  attemptId?: string | null;
  now?: string;
}

function canonicalMembership(
  projectId: string,
  originProduct: ProductDomain,
  items: ContextSetItem[],
): string {
  const sorted = [...items].sort((a, b) =>
    a.chunkId < b.chunkId ? -1 : a.chunkId > b.chunkId ? 1 : 0,
  );
  return JSON.stringify({
    projectId,
    originProduct,
    items: sorted.map((item) => ({
      chunkId: item.chunkId,
      documentId: item.documentId,
      documentVersionId: item.documentVersionId,
      classification: item.classification,
      originProduct: item.originProduct,
    })),
  });
}

function freezeItem(item: ContextSetItem): ContextSetItem {
  return Object.freeze({ ...item });
}

/**
 * Build a frozen context set with a deterministic stable identity: the same
 * project, origin product, and membership always produce the same id, so a
 * frozen context set is never generated anew on re-read. Every item is
 * permission-checked against the set project at construction — an
 * inaccessible source cannot enter the set.
 */
export function buildContextSet(input: BuildContextSetInput): ContextSet {
  if (!input.projectId.trim()) {
    throw new Error("Context set requires a project scope.");
  }
  if (input.items.length === 0) {
    throw new Error("Context set requires at least one item.");
  }
  const items: ContextSetItem[] = input.items.map((entry) => {
    if (entry.chunk.projectId !== input.projectId) {
      throw new Error(
        `Cross-project context denied: chunk ${entry.chunk.id} belongs to project ${entry.chunk.projectId}, set scope is ${input.projectId}`,
      );
    }
    if (entry.chunk.documentVersionId !== entry.documentVersionId) {
      throw new Error(
        `Version-pinning violation: chunk ${entry.chunk.id} belongs to version ${entry.chunk.documentVersionId}, item claims ${entry.documentVersionId}`,
      );
    }
    return freezeItem({
      chunkId: entry.chunk.id,
      documentId: entry.documentId,
      documentVersionId: entry.documentVersionId,
      projectId: input.projectId,
      rank: entry.rank ?? null,
      score: entry.score ?? null,
      citationId: entry.citationId ?? null,
      classification: entry.classification,
      originProduct: entry.originProduct ?? input.originProduct,
      permissionNote: entry.permissionNote ?? null,
    });
  });
  const digest = createHash("sha256")
    .update(canonicalMembership(input.projectId, input.originProduct, items), "utf8")
    .digest("hex")
    .slice(0, 24);
  return Object.freeze({
    id: `ctx_${digest}`,
    projectId: input.projectId,
    originProduct: input.originProduct,
    items: Object.freeze(items),
    traceId: input.traceId ?? null,
    runId: input.runId ?? null,
    attemptId: input.attemptId ?? null,
    createdAt: input.now ?? new Date().toISOString(),
  });
}

/** Re-resolve a historical set against live stores by pinned version ids. */
export function resolveContextSetVersions(
  set: ContextSet,
  versionsById: ReadonlyMap<string, { id: string; versionNumber: number }>,
): { resolved: number; missing: string[] } {
  const missing: string[] = [];
  let resolved = 0;
  for (const item of set.items) {
    if (versionsById.has(item.documentVersionId)) {
      resolved += 1;
    } else if (!missing.includes(item.documentVersionId)) {
      missing.push(item.documentVersionId);
    }
  }
  return { resolved, missing };
}

export class ContextSetAccessError extends Error {
  readonly code = "CONTEXT_ACCESS_DENIED";
}

export interface ContextSetStore {
  put(set: ContextSet): Promise<void>;
  get(projectId: string, contextSetId: string): Promise<ContextSet | null>;
}

/**
 * Request-scoped/test store. Reads are project-fenced: knowledge of an id
 * alone grants nothing — a cross-project lookup returns null, never the set.
 */
export class InMemoryContextSetStore implements ContextSetStore {
  private readonly sets = new Map<string, ContextSet>();

  async put(set: ContextSet): Promise<void> {
    this.sets.set(`${set.projectId}:${set.id}`, set);
  }

  async get(projectId: string, contextSetId: string): Promise<ContextSet | null> {
    return this.sets.get(`${projectId}:${contextSetId}`) ?? null;
  }
}

/**
 * P11 memory/truth boundary. Memory-classified context may inform, suggest,
 * rank, or summarize — it must never satisfy an operational authority check
 * (tenant, approval, governance, credential, budget, or canonical-state
 * facts). This refusal is the mechanical enforcement: operational
 * fact-resolution paths must route candidate context through it.
 */
export function refuseMemoryAsOperationalFact(
  items: readonly Pick<ContextSetItem, "chunkId" | "classification">[],
  authorityKind: string,
): void {
  const offender = items.find((item) => item.classification === "MEMORY_CONTEXT");
  if (offender) {
    throw new ContextSetAccessError(
      `Memory is context, not operational truth: chunk ${offender.chunkId} (MEMORY_CONTEXT) cannot satisfy ${authorityKind}`,
    );
  }
}

export function isAuthoritativeContextItem(
  item: Pick<ContextSetItem, "classification">,
): boolean {
  return item.classification === "AUTHORITATIVE_CONTEXT";
}

export interface CrossProductGrant {
  id: string;
  sourceProduct: ProductDomain;
  consumerProduct: ProductDomain;
  projectId: string;
  reason: string;
  grantedBy: string;
  expiresAt: string;
}

export interface CrossProductReadRequest {
  sourceProduct: ProductDomain;
  consumerProduct: ProductDomain;
  projectId: string;
  contextSetId: string;
  actorId: string;
  reason: string;
  now?: string;
}

/**
 * Default-deny cross-product rule. Same-product reads are not governed here
 * (normal tenant/project permissions apply). Cross-product reads require an
 * explicit grant matching source, consumer, project scope, purpose, and
 * expiry — otherwise denied. A grant never changes operational authority.
 */
export function authorizeCrossProductRead(
  grant: CrossProductGrant | null | undefined,
  request: CrossProductReadRequest,
): { allowed: true; grantId: string } {
  const now = request.now ?? new Date().toISOString();
  if (request.sourceProduct === request.consumerProduct) {
    throw new ContextSetAccessError(
      "Same-product reads are not cross-product operations; use normal tenant/project permissions.",
    );
  }
  if (!grant) {
    throw new ContextSetAccessError(
      `Cross-product context denied by default: ${request.sourceProduct} → ${request.consumerProduct} has no explicit grant`,
    );
  }
  const problems: string[] = [];
  if (grant.sourceProduct !== request.sourceProduct) problems.push("sourceProduct");
  if (grant.consumerProduct !== request.consumerProduct) problems.push("consumerProduct");
  if (grant.projectId !== request.projectId) problems.push("projectId");
  if (grant.expiresAt <= now) problems.push("expired");
  if (!request.reason.trim() || !request.actorId.trim()) problems.push("audit-metadata");
  if (problems.length > 0) {
    throw new ContextSetAccessError(
      `Cross-product grant ${grant.id} does not authorize this read (${problems.join(", ")})`,
    );
  }
  return { allowed: true, grantId: grant.id };
}

/** Auditable correlation payload for an authorized cross-product read. */
export function crossProductReadAudit(
  grantId: string,
  request: CrossProductReadRequest,
): Record<string, string> {
  return {
    operation: "context.cross_product_read",
    grantId,
    sourceProduct: request.sourceProduct,
    consumerProduct: request.consumerProduct,
    projectId: request.projectId,
    contextSetId: request.contextSetId,
    actorId: request.actorId,
    reason: request.reason,
  };
}
