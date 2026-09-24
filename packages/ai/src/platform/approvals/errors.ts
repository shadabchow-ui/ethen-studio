export type ApprovalContractErrorCode =
  | "INVALID_INPUT"
  | "APPROVAL_NOT_FOUND"
  | "INVALID_DECISION"
  | "SEPARATION_OF_DUTIES"
  | "PERSISTENCE_CONFLICT";

export class ApprovalContractError extends Error {
  constructor(
    readonly code: ApprovalContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApprovalContractError";
  }
}

export class ApprovalPersistenceError extends Error {
  constructor(operation: string, detail: string) {
    super(`Canonical approval persistence failed during ${operation}: ${detail}`);
    this.name = "ApprovalPersistenceError";
  }
}
