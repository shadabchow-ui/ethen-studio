/** Studio V5 economics — price configuration (STUDIO_04). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import { EconomicsError, type PriceConfig } from "./types";

export interface PriceCatalog {
  resolve(task: TaskName, endpointId: string, priceVersion: string): Promise<PriceConfig | null>;
}

/**
 * Resolve the price row for an estimate. Absence (no row, retired row)
 * closes paid admission with ADMISSION_CLOSED — never a guessed price.
 */
export async function requirePrice(
  catalog: PriceCatalog,
  task: TaskName,
  endpointId: string,
  priceVersion: string,
  nowIso?: string,
): Promise<PriceConfig> {
  const row = await catalog.resolve(task, endpointId, priceVersion);
  if (!row) {
    throw new EconomicsError(
      "ADMISSION_CLOSED",
      `No price configuration for ${task} on ${endpointId}@${priceVersion}; paid admission is closed.`,
    );
  }
  const now = nowIso ?? new Date().toISOString();
  if (row.retiredAt !== null && row.retiredAt <= now) {
    throw new EconomicsError(
      "ADMISSION_CLOSED",
      `Price ${priceVersion} for ${task} is retired; paid admission is closed.`,
    );
  }
  return row;
}

export function validatePriceConfig(row: PriceConfig): void {
  if (!Number.isInteger(row.unitPriceIcu) || row.unitPriceIcu < 0) {
    throw new EconomicsError("INVALID_INPUT", "Price unit_price_icu must be a non-negative integer.");
  }
  if (!Number.isInteger(row.minorPerIcu) || row.minorPerIcu <= 0) {
    throw new EconomicsError("INVALID_INPUT", "Price minor_per_icu must be a positive integer.");
  }
  if (!Number.isInteger(row.skuRate) || row.skuRate <= 0) {
    throw new EconomicsError("INVALID_INPUT", "Price sku_rate must be a positive integer.");
  }
  if (row.priceVersion.trim().length === 0 || row.endpointId.trim().length === 0) {
    throw new EconomicsError("INVALID_INPUT", "Price version and endpoint are required.");
  }
}
