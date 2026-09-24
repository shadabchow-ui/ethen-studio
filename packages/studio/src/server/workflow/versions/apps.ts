/**
 * Studio V5 Workflow→App contract (STUDIO_12).
 * Freezes a graph version plus form input/output schema, owner and
 * permissions. Private workspace distribution first. App invocation
 * executes the same compiler/runtime path: the frozen DAG hash must
 * resolve to a stored immutable DAG, and the payload must satisfy the
 * frozen form schema.
 */
import type {
  CanvasGraph,
  CompilerDiagnostic,
  WorkflowAppDefinition,
  WorkflowAppFormField,
} from "../../../contracts/graph";
import type { StoredDag } from "./revisions";

export interface FreezeAppInput {
  appId: string;
  graphId: string;
  frozenDagHash: string;
  frozenRevision: number;
  inputs: WorkflowAppFormField[];
  outputs: WorkflowAppFormField[];
  ownerId: string;
  invoke: string[];
  manage: string[];
}

export type FreezeAppResult =
  | { ok: true; app: WorkflowAppDefinition }
  | { ok: false; diagnostics: CompilerDiagnostic[] };

function fieldError(field: string, message: string): CompilerDiagnostic {
  return { code: "APP_SCHEMA_MISMATCH", message: `App form field "${field}": ${message}.`, nodeId: null, port: field };
}

/**
 * Check form schema compatibility against the graph's exposed input /
 * output bindings: every form input must match an input binding's media
 * type and unit; every form output must match an output binding.
 */
export function checkAppSchemaCompatibility(
  graph: CanvasGraph,
  inputs: readonly WorkflowAppFormField[],
  outputs: readonly WorkflowAppFormField[],
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  const inputBindings = graph.nodes.filter((n) => n.kind === "input");
  const outputBindings = graph.nodes.filter((n) => n.kind === "output");
  for (const field of inputs) {
    const binding = inputBindings.find((n) => n.id === field.name || n.outputs.some((p) => p.name === field.name));
    if (!binding) {
      diagnostics.push(fieldError(field.name, "no matching workflow input binding"));
      continue;
    }
    const port = binding.outputs.find((p) => p.name === field.name) ?? binding.outputs[0];
    if (port && port.mediaType !== field.mediaType) {
      diagnostics.push(fieldError(field.name, `media ${field.mediaType} incompatible with binding ${port.mediaType}`));
    } else if (port && port.unit !== field.unit) {
      diagnostics.push(fieldError(field.name, "unit incompatible with binding"));
    }
  }
  for (const field of outputs) {
    const binding = outputBindings.find((n) => n.id === field.name || n.inputs.some((p) => p.name === field.name));
    if (!binding) {
      diagnostics.push(fieldError(field.name, "no matching workflow output binding"));
      continue;
    }
    const port = binding.inputs.find((p) => p.name === field.name) ?? binding.inputs[0];
    if (port && port.mediaType !== field.mediaType) {
      diagnostics.push(fieldError(field.name, `media ${field.mediaType} incompatible with binding ${port.mediaType}`));
    } else if (port && port.unit !== field.unit) {
      diagnostics.push(fieldError(field.name, "unit incompatible with binding"));
    }
  }
  return diagnostics;
}

/** Freeze a Workflow→App definition. Pure. */
export function freezeWorkflowApp(graph: CanvasGraph, input: FreezeAppInput): FreezeAppResult {
  const diagnostics: CompilerDiagnostic[] = [];
  if (!input.appId?.trim()) {
    diagnostics.push({ code: "APP_SCHEMA_MISMATCH", message: "App id is required.", nodeId: null, port: null });
  }
  if (!input.ownerId?.trim()) {
    diagnostics.push({ code: "APP_SCHEMA_MISMATCH", message: "App owner is required.", nodeId: null, port: null });
  }
  if (!/^[0-9a-f]{64}$/.test(input.frozenDagHash)) {
    diagnostics.push({
      code: "APP_SCHEMA_MISMATCH",
      message: "Frozen DAG hash must be a 64-hex SHA-256.",
      nodeId: null,
      port: null,
    });
  }
  diagnostics.push(...checkAppSchemaCompatibility(graph, input.inputs, input.outputs));
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  return {
    ok: true,
    app: {
      appId: input.appId,
      graphId: input.graphId,
      frozenDagHash: input.frozenDagHash,
      frozenRevision: input.frozenRevision,
      inputs: [...input.inputs],
      outputs: [...input.outputs],
      ownerId: input.ownerId,
      visibility: "private-workspace",
      permissions: { invoke: [...input.invoke], manage: [...input.manage] },
    },
  };
}

export type InvokeAppResult =
  | { ok: true; dag: StoredDag }
  | { ok: false; diagnostics: CompilerDiagnostic[] };

/**
 * Authorize and resolve an app invocation: caller must hold invoke (or
 * manage) permission, the frozen DAG must resolve immutably, and the
 * payload must satisfy the frozen input schema. Returns the DAG for the
 * same compiler/runtime execution path.
 */
export function resolveAppInvocation(
  app: WorkflowAppDefinition,
  callerId: string,
  payload: Readonly<Record<string, unknown>>,
  lookupDag: (dagHash: string) => StoredDag | null,
): InvokeAppResult {
  if (!app.permissions.invoke.includes(callerId) && !app.permissions.manage.includes(callerId)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "UNAUTHORIZED_ASSET",
          message: `Caller ${callerId} may not invoke app ${app.appId} (private workspace).`,
          nodeId: null,
          port: null,
        },
      ],
    };
  }
  const dag = lookupDag(app.frozenDagHash);
  if (!dag) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "APP_SCHEMA_MISMATCH",
          message: `App ${app.appId} frozen DAG ${app.frozenDagHash.slice(0, 12)}… does not resolve.`,
          nodeId: null,
          port: null,
        },
      ],
    };
  }
  for (const field of app.inputs) {
    if (field.required && (payload[field.name] === undefined || payload[field.name] === null)) {
      return {
        ok: false,
        diagnostics: [fieldError(field.name, "required form value is missing")],
      };
    }
  }
  return { ok: true, dag };
}
