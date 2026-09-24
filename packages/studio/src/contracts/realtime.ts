/** Studio V5 kernel — realtime session epochs (money still owned by economics). */
import type { ProjectScope } from "./scope";
import type { IcuAmount } from "./money";

export type RealtimeSessionStatus =
  | "STARTING"
  | "ACTIVE"
  | "RECONNECTING"
  | "ENDED"
  | "REVOKED"
  | "ERRORED";

export interface ConnectedInterval {
  startAt: string;
  endAt: string | null;
}

export interface RealtimeSession {
  sessionId: string;
  epoch: number;
  scope: ProjectScope;
  status: RealtimeSessionStatus;
  identityBindingId: string | null;
  spendCapIcu: IcuAmount;
  spentIcu: IcuAmount;
  intervals: readonly ConnectedInterval[];
  toolScopeIds: readonly string[];
  createdAt: string;
}
