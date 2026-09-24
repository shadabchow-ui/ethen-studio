/** Studio V5 kernel — cross-domain operation ports. Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import type { ExecutionRequest, Quote } from "../../contracts/execution";
import type { PolicyDecision, PolicyAction } from "../../contracts/policy";
import type { ProjectScope } from "../../contracts/scope";
import type { IcuAmount } from "../../contracts/money";

export interface PolicyPort {
  decide(
    scope: ProjectScope,
    task: TaskName,
    action: PolicyAction,
    input: Readonly<Record<string, unknown>>,
  ): Promise<PolicyDecision>;
}

export interface EconomicsPort {
  quote(request: ExecutionRequest): Promise<Quote>;
  reserve(quoteId: string, scope: ProjectScope): Promise<string>;
  settle(reservationId: string, scope: ProjectScope, actualIcu: IcuAmount): Promise<string>;
  release(reservationId: string, scope: ProjectScope): Promise<void>;
}

export interface RoutingPort {
  route(request: ExecutionRequest): Promise<{ endpointId: string; reason: string; excluded: readonly string[] }>;
}

export interface MediaPort {
  ingest(providerUrl: string, scope: ProjectScope, jobId: string): Promise<string>;
}

export interface NotificationPort {
  notify(scope: ProjectScope, event: string, payload: Readonly<Record<string, unknown>>): Promise<void>;
}
