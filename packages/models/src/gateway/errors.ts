/**
 * Gateway error taxonomy.
 *
 * The declarations live in `@ethen/security` (they are the shared trust-boundary
 * error shapes). The gateway re-exports them so its own modules and consumers
 * keep a single, stable import path.
 */
export * from "@ethen/security/gateway-errors";
