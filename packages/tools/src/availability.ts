import "server-only";

import { TOOL_REGISTRY } from "./registry";
import {
  planToolAvailability as planToolAvailabilityCore,
  planToolAvailabilityBatch as planToolAvailabilityBatchCore,
} from "./availability-core";
export type {
  ToolAvailabilityResult,
  ToolAvailabilityInput,
  ToolAvailabilityDiagnostic,
} from "@ethen/contracts/tools/types";

export function planToolAvailability(input: Parameters<typeof planToolAvailabilityCore>[0]) {
  return planToolAvailabilityCore(input, TOOL_REGISTRY);
}

export function planToolAvailabilityBatch(inputs: Parameters<typeof planToolAvailabilityBatchCore>[0]) {
  return planToolAvailabilityBatchCore(inputs, TOOL_REGISTRY);
}
