/**
 * Studio V5 legacy limited-workflow translation (STUDIO_12).
 * Legacy `studio_workflows.definition` rows ({nodes, edges} with V2 ops)
 * translate to Canvas graphs only when fully valid: supported op subset,
 * resolved edges, acyclic, within bounds. Anything else is archived
 * read-only with a diagnostic — never executed, never silently dropped.
 */
import type {
  CanvasGraph,
  CanvasGraphEdge,
  CanvasGraphNode,
  CompilerDiagnostic,
  TypedPort,
} from "../../../contracts/graph";
import { validateGraph } from "../compiler/validate";

export interface LegacyWorkflowNode {
  id: string;
  op: string;
  inputs: string[];
  params: Record<string, unknown>;
}

export interface LegacyWorkflowEdge {
  from: string;
  to: string;
}

export interface LegacyWorkflowDefinition {
  nodes: LegacyWorkflowNode[];
  edges: LegacyWorkflowEdge[];
}

/**
 * Translatable subset: generative tasks plus export-as-composition
 * (export.deliver is a composition, never a canonical task). Legacy-only
 * ops (brief.create, evaluate) have no canonical equivalent and force
 * read-only archival with a diagnostic.
 */
const TRANSLATABLE_OPS = ["image.generate", "video.generate", "export"] as const;

function port(name: string, mediaType: string, required: boolean, label: string): TypedPort {
  return { name, mediaType, unit: null, required, label };
}

function portsFor(op: string): { inputs: TypedPort[]; outputs: TypedPort[] } | null {
  // Legacy generative nodes are self-contained: prompts travel inline in
  // params (enforced below), not as graph edges. Export keeps a required
  // upstream asset edge.
  switch (op) {
    case "image.generate":
      return {
        inputs: [port("prompt", "text", false, "Prompt text")],
        outputs: [port("image", "image", true, "Generated image")],
      };
    case "video.generate":
      return {
        inputs: [
          port("prompt", "text", false, "Prompt text"),
          port("reference", "image", false, "Reference image"),
        ],
        outputs: [port("video", "video", true, "Generated video")],
      };
    case "export":
      return {
        inputs: [port("asset", "asset", true, "Asset to deliver")],
        outputs: [port("delivery", "export", true, "Delivery package")],
      };
    default:
      return null;
  }
}

export type LegacyTranslation =
  | { status: "translated"; graph: CanvasGraph }
  | { status: "archived"; diagnostics: CompilerDiagnostic[] };

export function translateLegacyWorkflow(definition: LegacyWorkflowDefinition): LegacyTranslation {
  if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
    return {
      status: "archived",
      diagnostics: [
        { code: "INVALID_PARAM", message: "Legacy definition lacks nodes/edges arrays.", nodeId: null, port: null },
      ],
    };
  }
  const nodes: CanvasGraphNode[] = [];
  for (const legacy of definition.nodes) {
    if (!(TRANSLATABLE_OPS as readonly string[]).includes(legacy.op)) {
      return {
        status: "archived",
        diagnostics: [
          {
            code: "UNSUPPORTED_SCHEMA",
            message:
              `Legacy node ${legacy.id} uses op "${legacy.op}", which has no canonical Canvas equivalent; ` +
              "workflow archived read-only.",
            nodeId: legacy.id,
            port: null,
          },
        ],
      };
    }
    const ports = portsFor(legacy.op);
    if (!ports) {
      return {
        status: "archived",
        diagnostics: [
          { code: "UNSUPPORTED_SCHEMA", message: `Legacy op "${legacy.op}" is not translatable.`, nodeId: legacy.id, port: null },
        ],
      };
    }
    if (legacy.op !== "export") {
      const prompt = (legacy.params ?? {}).prompt;
      if (typeof prompt !== "string" || prompt.trim().length === 0) {
        return {
          status: "archived",
          diagnostics: [
            {
              code: "MISSING_INPUT",
              message: `Legacy node ${legacy.id} has no prompt; workflow archived read-only.`,
              nodeId: legacy.id,
              port: "prompt",
            },
          ],
        };
      }
    }
    const isExport = legacy.op === "export";
    nodes.push({
      id: legacy.id,
      kind: isExport ? "composition" : "task",
      task: isExport ? null : legacy.op,
      operator: isExport ? "export.deliver" : null,
      params: { ...(legacy.params ?? {}), __legacyOp: legacy.op },
      inputs: ports.inputs,
      outputs: ports.outputs,
      label: `Legacy ${legacy.op} ${legacy.id}`,
      children: null,
      childEdges: null,
    });
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: CanvasGraphEdge[] = [];
  for (const edge of definition.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) {
      return {
        status: "archived",
        diagnostics: [
          {
            code: "DANGLING_EDGE",
            message: `Legacy edge ${edge.from} -> ${edge.to} dangles; workflow archived read-only.`,
            nodeId: !from ? edge.from : edge.to,
            port: null,
          },
        ],
      };
    }
    edges.push({
      from: edge.from,
      fromPort: from.outputs[0]?.name ?? "out",
      to: edge.to,
      toPort: to.inputs[0]?.name ?? "in",
    });
  }

  const graph: CanvasGraph = { nodes, edges };
  const validation = validateGraph(graph, { maxNodes: 50 });
  if (!validation.ok) {
    return {
      status: "archived",
      diagnostics: validation.diagnostics.map((d) => ({
        ...d,
        message: `${d.message} (legacy workflow archived read-only)`,
      })),
    };
  }
  return { status: "translated", graph };
}
