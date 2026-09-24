import {
  resolveCanonicalModelReference,
  type CanonicalModelReferenceResolution,
} from "../model-intelligence/registry-api";

/** Gateway inventory-to-MI boundary.  Runtime state is deliberately absent. */
export type GatewayCanonicalResolution = CanonicalModelReferenceResolution;

export function resolveGatewayCanonicalModel(input: {
  modelId: string;
  providerId: string | null;
}): GatewayCanonicalResolution {
  return resolveCanonicalModelReference(input.modelId, input.providerId);
}
export { listRuntimeStates, projectRuntimeState, MI_RUNTIME_HEALTH_POLICY_VERSION } from "../model-intelligence/runtime-overlay";
