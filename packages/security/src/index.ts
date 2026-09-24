/**
 * @ethen/security — shared-package skeleton.
 *
 * Purpose: CSP construction, origin/CSRF evaluation, redaction, safe redirects, sensitive-path policy.
 *
 * Job 1 created the package boundary. U01 extracted the perimeter policy
 * (./perimeter: prefix lists, predicates, per-app delegate); the remaining
 * extraction plan lives in
 * artifacts/multi-build/MULTI_BUILD_SHARED_PACKAGES.md and executes in Job 2.
 */

export const PACKAGE_NAME = "./index" as const;
export const EXTRACTION_STATUS = "perimeter-extracted" as const;

export * from "./perimeter";
export * from "./standalone-edge";
