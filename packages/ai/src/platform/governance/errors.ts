export class GovernanceError extends Error {
  constructor(
    readonly code:
      | "BUDGET_DENIED"
      | "DELETION_DISABLED"
      | "LEGAL_HOLD"
      | "DELETION_INCOMPLETE"
      | "PERSISTENCE_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "GovernanceError";
  }
}

