/**
 * @ethen/database — shared-package skeleton.
 *
 * Purpose: Supabase clients, typed schema access, RLS-aware query helpers.
 *
 * Job 1 creates the package boundary only. No implementation has been moved
 * out of the monolith yet; the extraction plan lives in
 * artifacts/multi-build/MULTI_BUILD_SHARED_PACKAGES.md and executes in Job 2.
 */

export const PACKAGE_NAME = "@ethen/database" as const;
export const EXTRACTION_STATUS = "planned" as const;
