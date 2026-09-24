/**
 * @ethen/ai — frozen public barrel (U02-B extraction).
 *
 * Durable job contracts first: queue/claim/lease/idempotency envelopes shared
 * by every deployable and the canonical worker. Deep imports into the package
 * are forbidden; this barrel is the only entry point.
 */
export const PACKAGE_NAME = "@ethen/ai" as const;
export const EXTRACTION_STATUS = "extracted" as const;

export * from "./platform/jobs/contract";
export * from "./platform/jobs/errors";
export * from "./platform/jobs/execution-identity";
