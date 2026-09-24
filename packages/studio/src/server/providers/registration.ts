/**
 * Studio V5 providers — default wiring + worker binding (STUDIO_06). Server-only.
 *
 * Registers the two measured shared adapters (fal queue, OpenAI images) on a
 * registry. Synthetic adapters are never registered here — tests register
 * them explicitly. The worker binder adapts the registry to the
 * STUDIO_05 worker provider seam (structural match, no worker import: the
 * worker depends on core, never the reverse).
 */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import { isTaskName } from "../../contracts/tasks";
import type { ProviderAdapterPort, ProviderOperationState, ProviderOutputDescriptor } from "../ports/provider-adapter";
import type { EndpointSpec } from "../../catalog/types";
import { ProviderError } from "./types";
import {
  ProviderRegistry,
  getDefaultProviderRegistry,
  resetDefaultProviderRegistry,
} from "./registry";
import { FAL_ADAPTER_NAME, FAL_ADAPTER_VERSION } from "./fal-constants";
import { createFalProviderAdapter, FAL_SUPPORTED_TASKS, type FalAdapterConfig } from "./adapters/fal";
import {
  createOpenAiProviderAdapter,
  OPENAI_ADAPTER_NAME,
  OPENAI_ADAPTER_VERSION,
} from "./adapters/openai";

/**
 * Register the Studio-owned adapters on the default registry (idempotent
 * guard). Deployments pass real fal dependencies (spec reader, durable
 * store); without them the fal binding fails submit closed.
 */
export function registerStudioCatalogAdapters(
  registry: ProviderRegistry = getDefaultProviderRegistry(),
  overrides?: { fal?: FalAdapterConfig },
): ProviderRegistry {
  if (!registry.has(FAL_ADAPTER_NAME)) {
    registry.register({
      adapterName: FAL_ADAPTER_NAME,
      adapterVersion: FAL_ADAPTER_VERSION,
      supportedTasks: [...FAL_SUPPORTED_TASKS],
      create: () => createFalProviderAdapter(overrides?.fal),
    });
  }
  if (!registry.has(OPENAI_ADAPTER_NAME)) {
    registry.register({
      adapterName: OPENAI_ADAPTER_NAME,
      adapterVersion: OPENAI_ADAPTER_VERSION,
      supportedTasks: ["image.generate"],
      create: () => createOpenAiProviderAdapter(),
    });
  }
  return registry;
}

export { resetDefaultProviderRegistry };

/** Payload contract the worker sends per dispatch (endpoint pinned at route). */
export interface WorkerDispatchPayload {
  /** Explicit adapter routing wins; otherwise the endpoint spec selects. Exactly one is required. */
  endpointId?: string;
  adapterName?: string;
  task: TaskName;
  parameters: Readonly<Record<string, unknown>>;
  /** Durable identity for the operation row (the j05 key carries no attempt id). */
  jobId?: string;
  attemptId?: string;
}

/** Structural match of the STUDIO_05 StudioProviderPort (no worker import). */
export interface WorkerProviderBinding {
  submit(operationKey: string, payload: Readonly<Record<string, unknown>>): Promise<string>;
  query(operationId: string): Promise<ProviderOperationState>;
  reconcile(operationId: string, operationKey: string): Promise<ProviderOperationState>;
  cancel(operationId: string): Promise<boolean>;
  retrieveOutputs(operationId: string): Promise<readonly ProviderOutputDescriptor[]>;
  reportUsage(operationId: string): Promise<{ providerMinor: number | null; minorPerIcu: number }>;
}

/**
 * Bind the registry to the worker seam. The adapter instance is resolved per
 * call from the operation id prefix so worker restarts need no sticky state:
 * `fal:…` → fal-queue, `openai:…` → openai-images, `synthetic:…` → the
 * registered synthetic adapter. Unknown prefixes fail closed.
 */
export interface WorkerProviderBindingDeps {
  /** Resolve the pinned spec for endpoint-routed dispatch. */
  resolveSpec?: (endpointId: string) => Promise<EndpointSpec | null>;
}

export function createWorkerProviderBinding(
  registry: ProviderRegistry = getDefaultProviderRegistry(),
  deps?: WorkerProviderBindingDeps,
): WorkerProviderBinding {
  function adapterForOperation(operationId: string): ProviderAdapterPort {
    const prefix = operationId.split(":")[0];
    const name =
      prefix === "fal"
        ? FAL_ADAPTER_NAME
        : prefix === "openai"
          ? OPENAI_ADAPTER_NAME
          : prefix === "synthetic"
            ? "synthetic-test"
            : null;
    if (!name) {
      throw new ProviderError("NOT_FOUND", `No provider adapter serves operation ${operationId}.`);
    }
    return registry.require(name);
  }

  return {
    async submit(operationKey: string, payload: Readonly<Record<string, unknown>>): Promise<string> {
      const dispatch = payload as Partial<WorkerDispatchPayload>;
      if (
        typeof dispatch.task !== "string" ||
        !isTaskName(dispatch.task) ||
        typeof dispatch.parameters !== "object" ||
        dispatch.parameters === null
      ) {
        throw new ProviderError("INVALID_PARAMETERS", "Worker dispatch payload must carry task and parameters.");
      }
      // Adapter routing: an explicit adapterName wins; otherwise the
      // pinned endpoint spec selects its bound adapter. Generic adapters
      // receive the endpoint id + spec context for schema-driven submit.
      let adapterName = typeof dispatch.adapterName === "string" ? dispatch.adapterName : null;
      let spec: EndpointSpec | null = null;
      const endpointId =
        typeof dispatch.endpointId === "string" && dispatch.endpointId.trim().length > 0
          ? dispatch.endpointId.trim()
          : null;
      if (!adapterName) {
        if (!endpointId) {
          throw new ProviderError("INVALID_PARAMETERS", "Worker dispatch payload must carry adapterName or endpointId.");
        }
        if (!deps?.resolveSpec) {
          throw new ProviderError("SETUP_REQUIRED", "No spec reader configured for endpoint-routed dispatch.");
        }
        spec = await deps.resolveSpec(endpointId);
        if (!spec) {
          throw new ProviderError("NOT_FOUND", `No pinned spec for endpoint ${endpointId}.`);
        }
        adapterName = spec.adapterName;
      }
      const adapter = registry.require(adapterName);
      const jobId = typeof dispatch.jobId === "string" && dispatch.jobId.length > 0 ? dispatch.jobId : undefined;
      const attemptId =
        typeof dispatch.attemptId === "string" && dispatch.attemptId.length > 0 ? dispatch.attemptId : undefined;
      return adapter.submit(dispatch.task, dispatch.parameters as Readonly<Record<string, unknown>>, operationKey, {
        endpointId: endpointId ?? undefined,
        spec: spec ?? undefined,
        jobId,
        attemptId,
      });
    },
    query: async (operationId: string) => adapterForOperation(operationId).query(operationId),
    reconcile: async (operationId: string, operationKey: string) =>
      adapterForOperation(operationId).reconcile(operationId, operationKey),
    cancel: async (operationId: string) => adapterForOperation(operationId).cancel(operationId),
    retrieveOutputs: async (operationId: string) =>
      adapterForOperation(operationId).retrieveOutputs(operationId),
    async reportUsage(operationId: string) {
      const report = await adapterForOperation(operationId).reportUsage(operationId);
      // M4 provider calibration: provider minor is microdollars (the M2
      // price-parser unit); 1 ICU = $0.001, so 1000 minor per ICU. Both
      // queue adapters report null minor today, making the divisor
      // evidence-only — but it must still be explicit, never invented.
      return { providerMinor: report.providerMinorAmount, minorPerIcu: 1000 };
    },
  };
}
