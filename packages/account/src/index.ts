/**
 * @ethen/account — frozen public barrel (U02-A extraction).
 *
 * Deep imports into the package are forbidden; this barrel (plus
 * `./server` for server-only modules) is the only entry point.
 */
export const PACKAGE_NAME = "@ethen/account" as const;
export const EXTRACTION_STATUS = "extracted" as const;

export * from "./favorites/actions";
export * from "./saved-work/durability";
export * from "./saved-work/types";
export * from "./sessions/queries";
export * from "./sessions/types";
export * from "./sessions/usage-tracking";
export * from "./settings/policy-summary";
