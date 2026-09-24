/** Studio V5 kernel — provider adapter port (authority §10). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import type { IcuAmount } from "../../contracts/money";
import type { EndpointSpec } from "../../catalog/types";

export interface UsageEstimate {
  meterUnit: string;
  meterQuantity: number;
  estimatedCostIcu: IcuAmount;
}

export interface ProviderOutputDescriptor {
  providerUrl: string;
  mediaType: string;
  byteSize: number | null;
  expiresAt: string | null;
}

export interface ProviderUsageReport {
  meterUnit: string;
  meterQuantity: number;
  providerMinorAmount: number | null;
  redactedError: string | null;
}

export type ProviderOperationState =
  | "SUBMITTED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "UNKNOWN";

/**
 * Submit context (M4, optional): the pinned endpoint id and its resolved
 * spec. Generic adapters (fal-queue) require the endpoint id and fail
 * closed without it; single-model adapters ignore the context.
 */
export interface ProviderSubmitContext {
  endpointId?: string;
  spec?: EndpointSpec;
  /**
   * Durable operation identity. The j05 operation key
   * (`studio-v5:{job}:attempt-{n}`) carries no attempt id, so the worker
   * passes both ids explicitly; adapters prefer them over key parsing.
   */
  jobId?: string;
  attemptId?: string;
}

/** Every provider adapter implements exactly this port. Owned by STUDIO_06. */
export interface ProviderAdapterPort {
  readonly adapterName: string;
  readonly adapterVersion: string;
  readonly supportedTasks: readonly TaskName[];
  validate(task: TaskName, parameters: Readonly<Record<string, unknown>>): void;
  estimateUsage(task: TaskName, parameters: Readonly<Record<string, unknown>>): UsageEstimate;
  submit(
    task: TaskName,
    parameters: Readonly<Record<string, unknown>>,
    operationKey: string,
    ctx?: ProviderSubmitContext,
  ): Promise<string>;
  query(operationId: string): Promise<ProviderOperationState>;
  reconcile(operationId: string, operationKey: string): Promise<ProviderOperationState>;
  cancel(operationId: string): Promise<boolean>;
  retrieveOutputs(operationId: string): Promise<readonly ProviderOutputDescriptor[]>;
  reportUsage(operationId: string): Promise<ProviderUsageReport>;
}
