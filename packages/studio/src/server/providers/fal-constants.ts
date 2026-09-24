/**
 * Studio V5 providers — fal adapter identity constants. Pure (no
 * server-only marker) so catalog sync, projections and tests share the one
 * adapter name/version without importing the server-only adapter.
 */
export const FAL_ADAPTER_NAME = "fal-queue" as const;
export const FAL_ADAPTER_VERSION = "2026-08-02" as const;
