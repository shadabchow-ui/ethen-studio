/** Studio V5 kernel — frozen pinned versions (STUDIO_01 owns changes). */

export const STUDIO_CONTRACT_VERSION = "1.0.0" as const;
export const STUDIO_WORKFLOW_IR_VERSION = "1.0.0" as const;
export const STUDIO_TASK_SCHEMA_VERSION = "1.0.0" as const;
export const STUDIO_PRICE_VERSION = "1.0.0" as const;
export const STUDIO_ADAPTER_API_VERSION = "1.0.0" as const;

/** Pinned pins carried on every estimate/run (authority §9). */
export interface VersionPins {
  taskSchemaVersion: string;
  endpointSchemaVersion: string;
  priceVersion: string;
  adapterVersion: string;
}

export const DEFAULT_VERSION_PINS: VersionPins = {
  taskSchemaVersion: STUDIO_TASK_SCHEMA_VERSION,
  endpointSchemaVersion: STUDIO_TASK_SCHEMA_VERSION,
  priceVersion: STUDIO_PRICE_VERSION,
  adapterVersion: STUDIO_ADAPTER_API_VERSION,
} as const;
