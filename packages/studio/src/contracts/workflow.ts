/** Studio V5 kernel — compiled immutable workflow DAG (private IR, no stability promise). */
import type { TaskName } from "./tasks";
import type { ProjectScope } from "./scope";
import type { VersionPins } from "./versions";
import type { IcuAmount } from "./money";

export interface WorkflowPortRef {
  nodeId: string;
  port: string;
  mediaType: string;
  unit: string | null;
}

export interface WorkflowNode {
  nodeId: string;
  task: TaskName;
  pins: VersionPins;
  endpointId: string;
  parameters: Readonly<Record<string, unknown>>;
  inputs: readonly WorkflowPortRef[];
  outputs: readonly WorkflowPortRef[];
  identityBindingId: string | null;
  policyProfile: string;
  budgetIcu: IcuAmount;
}

export interface WorkflowIR {
  irVersion: string;
  dagHashSha256: string;
  graphRevisionId: string;
  scope: ProjectScope;
  nodes: readonly WorkflowNode[];
  budgetEnvelopeIcu: IcuAmount;
  compiledAt: string;
}
