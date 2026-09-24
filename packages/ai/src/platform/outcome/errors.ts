export type OutcomePlaneErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "DUPLICATE"
  | "UNVERIFIED"
  | "POLICY_DENIED"
  | "UNSUPPORTED";

export class OutcomePlaneError extends Error {
  constructor(
    readonly code: OutcomePlaneErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OutcomePlaneError";
  }
}
