/**
 * STUDIO_09 — pinned quote state machine (pure).
 *
 * A quote pins endpoint + parameters. Any model or parameter change
 * invalidates it back to idle; a fresh estimate that exceeds the prior
 * quote by more than 10% (or any hard cap) requires renewed approval.
 * Integer ICU throughout — no floating-point money.
 */

export type QuoteMachineState =
  | { status: "idle" }
  | { status: "estimating" }
  | { status: "quoted"; quoteId: string; endpointId: string; paramsHash: string; estimatedIcu: number; capIcu: number | null; expiresAt: string }
  | { status: "error"; message: string };

export type QuoteMachineAction =
  | { type: "REQUEST_ESTIMATE" }
  | { type: "ESTIMATE_OK"; quoteId: string; endpointId: string; paramsHash: string; estimatedIcu: number; capIcu: number | null; expiresAt: string }
  | { type: "ESTIMATE_FAILED"; message: string }
  | { type: "MODEL_CHANGED" }
  | { type: "PARAMS_CHANGED" }
  | { type: "EXPIRED" }
  | { type: "RESET" };

export const INITIAL_QUOTE_STATE: QuoteMachineState = { status: "idle" };

export function quoteReducer(state: QuoteMachineState, action: QuoteMachineAction): QuoteMachineState {
  switch (action.type) {
    case "REQUEST_ESTIMATE":
      return { status: "estimating" };
    case "ESTIMATE_OK":
      return {
        status: "quoted",
        quoteId: action.quoteId,
        endpointId: action.endpointId,
        paramsHash: action.paramsHash,
        estimatedIcu: action.estimatedIcu,
        capIcu: action.capIcu,
        expiresAt: action.expiresAt,
      };
    case "ESTIMATE_FAILED":
      return { status: "error", message: action.message };
    case "MODEL_CHANGED":
    case "PARAMS_CHANGED":
    case "EXPIRED":
    case "RESET":
      // A changed model or changed parameters invalidates the pinned
      // quote: the next Generate must re-estimate before admitting.
      return state.status === "quoted" || state.status === "error" || action.type === "RESET"
        ? { status: "idle" }
        : state;
  }
}

/**
 * True when `next` exceeds `prior` by more than 10% using integer math
 * (next * 10 > prior * 11), requiring renewed approval. A zero prior
 * with a positive next always requires approval.
 */
export function quoteNeedsReapproval(priorEstimatedIcu: number, nextEstimatedIcu: number): boolean {
  if (nextEstimatedIcu <= priorEstimatedIcu) return false;
  if (priorEstimatedIcu <= 0) return nextEstimatedIcu > 0;
  return nextEstimatedIcu * 10 > priorEstimatedIcu * 11;
}

/** True when the pinned quote no longer matches the current selection. */
export function quoteMatchesSelection(
  state: QuoteMachineState,
  selection: { endpointId: string; paramsHash: string },
): boolean {
  if (state.status !== "quoted") return false;
  return state.endpointId === selection.endpointId && state.paramsHash === selection.paramsHash;
}
