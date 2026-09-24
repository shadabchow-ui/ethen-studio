/**
 * @ethen/billing — frozen public barrel (U02-A extraction).
 *
 * Deep imports into the package are forbidden; this barrel (plus
 * `./server` for server-only modules) is the only entry point.
 */
export const PACKAGE_NAME = "@ethen/billing" as const;
export const EXTRACTION_STATUS = "extracted" as const;

export * from "./billing/checkout";
export * from "./billing/config";
export * from "./billing/customer";
export * from "./billing/domain";
export * from "./billing/entitlements";
export * from "./billing/gate";
export * from "./billing/overview";
export * from "./billing/portal";
export * from "./billing/principal";
export * from "./billing/projection";
export * from "./billing/reconcile";
export * from "./billing/stripe-client";
export * from "./billing/types";
// Both declarations are types; `isolatedModules` requires the type form.
export type { BillingReadiness as TypesBillingReadiness } from "./billing/types";
export type { BillingReadiness } from "./billing/domain";
