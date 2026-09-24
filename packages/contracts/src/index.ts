/**
 * `@ethen/contracts` — pure declaration authority.
 *
 * Types and frozen constant tables with no runtime dependency on any app,
 * service or other package. Reached by subpath; this barrel carries identity
 * only so a consumer never pulls every domain contract at once.
 */
export const PACKAGE_NAME = "./index" as const;
export const EXTRACTION_STATUS = "extracted" as const;
