export type ProofErrorCode =
  | "INVALID_INPUT"
  | "EVIDENCE_NOT_FOUND"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_VERSION_NOT_FOUND"
  | "INTEGRITY_VIOLATION"
  | "TENANT_BOUNDARY_VIOLATION"
  | "PERSISTENCE_FAILURE";

export class ProofContractError extends Error {
  constructor(
    readonly code: ProofErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProofContractError";
  }
}

export class ProofPersistenceError extends Error {
  constructor(operation: string, detail: string) {
    super(`Proof persistence failed during ${operation}: ${detail}`);
    this.name = "ProofPersistenceError";
  }
}
