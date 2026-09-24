/**
 * Studio V5 immutable graph revisions + compiled DAG store (STUDIO_12).
 * Authoring graphs evolve as append-only revisions; every revision is
 * content-addressed by canonical SHA-256. Compiled DAGs are immutable
 * records keyed by dag hash. Board-card history stays separate from the
 * executable DAG: card operations are never compiled or executed.
 */
import type {
  CanvasGraph,
  CompilerDiagnostic,
  GraphRevision,
} from "../../../contracts/graph";
import type { WorkflowIR } from "../../../contracts/workflow";
import { canonicalSha256 } from "../compiler/canonical";
import { compileGraph, type CompileOptions } from "../compiler/expand";
import { dirtyDownstreamClosure } from "../compiler/validate";

export interface StoredRevision extends GraphRevision {
  graph: CanvasGraph;
}

export interface StoredDag {
  dagHash: string;
  ir: WorkflowIR;
  graphId: string;
  revision: number;
  compiledAt: string;
}

export type CompileAndStoreResult =
  | { ok: true; revision: StoredRevision; dag: StoredDag; expandedUnits: number }
  | { ok: false; diagnostics: CompilerDiagnostic[] };

/**
 * Test/port adapter; production implements transactional RLS-scoped
 * persistence (j12 migration tables). Revisions and DAGs are append-only:
 * no update or delete operations exist.
 */
export class MemoryWorkflowVersionStore {
  private revisions = new Map<string, StoredRevision[]>();
  private dags = new Map<string, StoredDag>();

  /** Append a new immutable revision; identical content returns the existing one. */
  appendRevision(graphId: string, graph: CanvasGraph): StoredRevision {
    if (!graphId?.trim()) throw new Error("WORKFLOW_VERSIONS: graph id is required.");
    const frozen: CanvasGraph = structuredClone({ nodes: graph.nodes, edges: graph.edges });
    const { canonical, sha256 } = canonicalSha256(frozen);
    const list = this.revisions.get(graphId) ?? [];
    const existing = list.find((entry) => entry.sha256 === sha256);
    if (existing) return existing;
    const revision: StoredRevision = {
      graphId,
      revision: list.length + 1,
      canonicalJson: canonical,
      sha256,
      nodeCount: frozen.nodes.length,
      createdAt: new Date().toISOString(),
      graph: frozen,
    };
    list.push(revision);
    this.revisions.set(graphId, list);
    return revision;
  }

  getRevision(graphId: string, revision: number): StoredRevision | null {
    const list = this.revisions.get(graphId) ?? [];
    return list.find((entry) => entry.revision === revision) ?? null;
  }

  headRevision(graphId: string): StoredRevision | null {
    const list = this.revisions.get(graphId) ?? [];
    return list.length > 0 ? list[list.length - 1] : null;
  }

  listRevisions(graphId: string): StoredRevision[] {
    return [...(this.revisions.get(graphId) ?? [])];
  }

  /** Index every known graph by its head revision (M5 Canvas index, local lane). */
  listGraphs(): Array<{ graphId: string; headRevision: number; nodeCount: number; updatedAt: string }> {
    const graphs: Array<{ graphId: string; headRevision: number; nodeCount: number; updatedAt: string }> = [];
    for (const [graphId, list] of this.revisions) {
      const head = list[list.length - 1];
      if (!head) continue;
      graphs.push({ graphId, headRevision: head.revision, nodeCount: head.nodeCount, updatedAt: head.createdAt });
    }
    return graphs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  /**
   * Compile a stored revision and pin the immutable DAG. Recompiling the
   * same revision returns the same DAG (hash-addressed, idempotent).
   */
  compileRevision(
    graphId: string,
    revision: number,
    options: Omit<CompileOptions, "graphId" | "revision">,
  ): CompileAndStoreResult {
    const stored = this.getRevision(graphId, revision);
    if (!stored) {
      return {
        ok: false,
        diagnostics: [
          {
            code: "UNKNOWN_NODE",
            message: `Graph ${graphId} has no revision ${revision}.`,
            nodeId: null,
            port: null,
          },
        ],
      };
    }
    const compiled = compileGraph(stored.graph, { ...options, graphId, revision });
    if (!compiled.ok) return compiled;
    const existing = this.dags.get(compiled.dagHash);
    if (existing) return { ok: true, revision: stored, dag: existing, expandedUnits: compiled.expandedUnits };
    const dag: StoredDag = {
      dagHash: compiled.dagHash,
      ir: compiled.ir,
      graphId,
      revision,
      compiledAt: new Date().toISOString(),
    };
    this.dags.set(compiled.dagHash, dag);
    return { ok: true, revision: stored, dag, expandedUnits: compiled.expandedUnits };
  }

  getDag(dagHash: string): StoredDag | null {
    return this.dags.get(dagHash) ?? null;
  }

  /**
   * Changed nodes dirty their downstream closure; unchanged branches
   * reuse only valid assets (validity rechecked by execution).
   */
  dirtyNodes(graphId: string, revision: number, changedNodeIds: readonly string[]): string[] {
    const stored = this.getRevision(graphId, revision);
    if (!stored) throw new Error(`WORKFLOW_VERSIONS: graph ${graphId} has no revision ${revision}.`);
    return dirtyDownstreamClosure(stored.graph, changedNodeIds);
  }
}
