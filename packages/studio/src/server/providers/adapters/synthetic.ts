/**
 * Studio V5 providers — deterministic synthetic adapter (STUDIO_06). Server-only.
 *
 * Test/certification-only adapter: deterministic in-memory operations with
 * synthetic.invalid URLs that can never be mistaken for provider output.
 * Never registered in production wiring.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { TaskName } from "../../../contracts/tasks";
import type {
  ProviderAdapterPort,
  ProviderOperationState,
  ProviderOutputDescriptor,
  ProviderUsageReport,
  UsageEstimate,
} from "../../ports/provider-adapter";
import { ProviderError } from "../types";

export const SYNTHETIC_ADAPTER_NAME = "synthetic-test" as const;
export const SYNTHETIC_ADAPTER_VERSION = "0.0.0-test" as const;

export interface SyntheticAdapterConfig {
  tasks?: readonly TaskName[];
  meterUnit?: string;
  failSubmit?: boolean;
}

export function createSyntheticProviderAdapter(
  config: SyntheticAdapterConfig = {},
): ProviderAdapterPort {
  const tasks = config.tasks ?? (["image.generate", "video.generate"] as const);
  const meterUnit = config.meterUnit ?? "task_unit";
  const operations = new Map<string, { key: string; task: TaskName; quantity: number }>();
  const byKey = new Map<string, string>();

  function operationIdFor(key: string): string {
    return `synthetic:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
  }

  return {
    adapterName: SYNTHETIC_ADAPTER_NAME,
    adapterVersion: SYNTHETIC_ADAPTER_VERSION,
    supportedTasks: [...tasks],

    validate(task: TaskName, parameters: Readonly<Record<string, unknown>>): void {
      if (!(tasks as readonly string[]).includes(task)) {
        throw new ProviderError("UNSUPPORTED_TASK", `synthetic adapter does not serve ${task}.`);
      }
      if (typeof parameters.prompt !== "string" || !parameters.prompt.trim()) {
        throw new ProviderError("INVALID_PARAMETERS", "synthetic adapter requires a prompt.");
      }
    },

    estimateUsage(task: TaskName, parameters: Readonly<Record<string, unknown>>): UsageEstimate {
      this.validate(task, parameters);
      // M2 (Lock L): even the synthetic adapter refuses $0 estimates.
      throw new ProviderError("PRICE_UNKNOWN", "Price not verified for synthetic endpoint; refusing a $0 estimate.");
    },

    async submit(task: TaskName, parameters: Readonly<Record<string, unknown>>, operationKey: string): Promise<string> {
      this.validate(task, parameters);
      const replay = byKey.get(operationKey);
      if (replay) return replay;
      if (config.failSubmit) {
        throw new ProviderError("PROVIDER_FAILED", "synthetic adapter forced submit failure.");
      }
      const id = operationIdFor(operationKey);
      operations.set(id, { key: operationKey, task, quantity: 1 });
      byKey.set(operationKey, id);
      return id;
    },

    async query(operationId: string): Promise<ProviderOperationState> {
      return operations.has(operationId) ? "SUCCEEDED" : "UNKNOWN";
    },

    async reconcile(operationId: string, operationKey: string): Promise<ProviderOperationState> {
      const keyed = byKey.get(operationKey);
      if (keyed && keyed !== operationId) return this.query(keyed);
      return this.query(operationId);
    },

    async cancel(operationId: string): Promise<boolean> {
      return operations.has(operationId);
    },

    async retrieveOutputs(operationId: string): Promise<readonly ProviderOutputDescriptor[]> {
      if (!operations.has(operationId)) {
        throw new ProviderError("NOT_FOUND", `Unknown synthetic operation ${operationId}.`);
      }
      return [
        {
          providerUrl: `https://synthetic.invalid/output/${operationId}`,
          mediaType: "application/octet-stream",
          byteSize: null,
          expiresAt: null,
        },
      ];
    },

    async reportUsage(operationId: string): Promise<ProviderUsageReport> {
      const record = operations.get(operationId);
      if (!record) {
        throw new ProviderError("NOT_FOUND", `Unknown synthetic operation ${operationId}.`);
      }
      return { meterUnit, meterQuantity: record.quantity, providerMinorAmount: null, redactedError: null };
    },
  };
}
