export type RunContractErrorCode =
  | "INVALID_INPUT"
  | "RUN_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "PERSISTENCE_CONFLICT"
  | "EVENT_ORDER_VIOLATION"
  | "UNSUPPORTED_WORKSPACE_EXTENSION";

export class RunContractError extends Error {
  constructor(
    readonly code: RunContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RunContractError";
  }
}

export class RunPersistenceError extends Error {
  constructor(operation: string, cause?: string) {
    super(
      `Canonical run persistence failed during "${operation}"${
        cause ? `: ${cause}` : ""
      }.`,
    );
    this.name = "RunPersistenceError";
  }
}
