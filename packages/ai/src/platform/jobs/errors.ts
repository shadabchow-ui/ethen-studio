export type JobContractErrorCode =
  | "INVALID_INPUT"
  | "JOB_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "LEASE_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "CANCELLATION_CONFLICT";

export class JobContractError extends Error {
  constructor(
    readonly code: JobContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "JobContractError";
  }
}

export class JobPersistenceError extends Error {
  constructor(operation: string, cause?: string) {
    super(
      `Durable job persistence failed during "${operation}"${
        cause ? `: ${cause}` : ""
      }.`,
    );
    this.name = "JobPersistenceError";
  }
}
