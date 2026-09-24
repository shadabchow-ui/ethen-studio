/** Studio V5 providers — server-side parameter validation (STUDIO_06). Server-only. */
import "server-only";
import type { EndpointSpec } from "../../catalog/types";
import {
  validateCoreParameters,
  validateRawProviderParameters,
} from "../../catalog/schema-validation";
import { ProviderError } from "./types";

/**
 * Complete server validation: normalized core fields against the full
 * endpoint schema plus explicit raw-provider parameter validation.
 * Unknown required controls disable execution with an explanation.
 */
export function validateExecutionParameters(
  spec: EndpointSpec,
  parameters: Readonly<Record<string, unknown>>,
  providerParams: unknown,
): void {
  const core = validateCoreParameters(spec, parameters);
  if (!core.ok) {
    const first = core.problems[0];
    const unknownRequired =
      spec.requiredControls.includes(first.control) &&
      !spec.supportedControls.includes(first.control);
    throw new ProviderError(
      "INVALID_PARAMETERS",
      unknownRequired
        ? `Required control "${first.control}" is not supported by ${spec.endpointId}; execution is disabled.`
        : `Invalid parameters for ${spec.endpointId}: ${core.problems.map((p) => p.message).join("; ")}`,
    );
  }
  const raw = validateRawProviderParameters(spec, providerParams);
  if (!raw.ok) {
    throw new ProviderError(
      "INVALID_PARAMETERS",
      `Invalid provider_params for ${spec.endpointId}: ${raw.problems.map((p) => p.message).join("; ")}`,
    );
  }
}
