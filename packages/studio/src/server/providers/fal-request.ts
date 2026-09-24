/**
 * Studio V5 providers — fal queue request construction (STUDIO M4). Pure.
 *
 * Builds the exact queue request for any catalog endpoint from its pinned
 * spec: the URL is the verified queue path for the endpoint id, and the
 * body is the schema-validated canonical core plus validated
 * provider_params. No per-model code: endpoint variance lives in the M2
 * schema snapshots, never here. Browser-safe (no server-only marker) so
 * golden tests pin the construction without seams.
 */
import type { TaskName } from "../../contracts/tasks";
import type { EndpointSpec } from "../../catalog/types";
import {
  validateCoreParameters,
  validateRawProviderParameters,
} from "../../catalog/schema-validation";

export const FAL_QUEUE_BASE_URL = "https://queue.fal.run";

export interface FalQueueRequestInput {
  spec: EndpointSpec;
  task: TaskName;
  parameters: Readonly<Record<string, unknown>>;
  /** Public callback URL for queue webhooks; polling stays the fallback. */
  webhookUrl?: string | null;
}

export interface FalQueueRequest {
  endpointId: string;
  url: string;
  body: Readonly<Record<string, unknown>>;
}

/**
 * Verified queue path: every hash-pinned schema snapshot carries
 * queue_path === "/" + endpoint_id (162/162 at M4; the golden suite
 * re-proves this on every run). No mapping table to drift.
 */
export function queuePathForEndpoint(endpointId: string): string {
  const trimmed = endpointId.trim();
  if (trimmed.length === 0 || trimmed.includes("..") || trimmed.includes(" ") || trimmed.includes("?") || trimmed.includes("#")) {
    throw new Error(`STUDIO_FAL_REQUEST_INVALID: endpoint id is not a queue path: ${endpointId}.`);
  }
  return `/${trimmed.replace(/^\/+/, "")}`;
}

export function queueUrlForEndpoint(queueBaseUrl: string, endpointId: string): string {
  return `${queueBaseUrl.replace(/\/+$/, "")}${queuePathForEndpoint(endpointId)}`;
}

function problemsText(problems: ReadonlyArray<{ control: string; message: string }>): string {
  return problems.map((problem) => `${problem.control}: ${problem.message}`).join("; ");
}

/**
 * Build the exact queue request. The task must equal the spec task; core
 * parameters must satisfy the pinned schema; provider_params must satisfy
 * the endpoint raw allowlist. Anything else throws with the explicit
 * problems — never a guessed body.
 */
export function buildFalQueueRequest(input: FalQueueRequestInput, queueBaseUrl: string = FAL_QUEUE_BASE_URL): FalQueueRequest {
  const { spec, task, parameters } = input;
  if (task !== spec.task) {
    throw new Error(
      `STUDIO_FAL_REQUEST_INVALID: task ${task} does not match endpoint ${spec.endpointId} task ${spec.task}.`,
    );
  }
  const core = validateCoreParameters(spec, parameters);
  if (!core.ok) {
    throw new Error(`STUDIO_FAL_REQUEST_INVALID: ${problemsText(core.problems)}`);
  }
  const raw = validateRawProviderParameters(spec, parameters.provider_params);
  if (!raw.ok) {
    throw new Error(`STUDIO_FAL_REQUEST_INVALID: ${problemsText(raw.problems)}`);
  }
  const body: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(parameters)) {
    if (name === "provider_params") continue;
    body[name] = value;
  }
  const providerParams = parameters.provider_params as Readonly<Record<string, unknown>> | null | undefined;
  if (providerParams && typeof providerParams === "object") {
    for (const [name, value] of Object.entries(providerParams)) {
      if (name in body) {
        throw new Error(
          `STUDIO_FAL_REQUEST_INVALID: provider_params "${name}" shadows a canonical parameter for ${spec.endpointId}.`,
        );
      }
      body[name] = value;
    }
  }
  const webhookUrl = input.webhookUrl?.trim() ? input.webhookUrl.trim() : null;
  if (webhookUrl) {
    let parsed: URL;
    try {
      parsed = new URL(webhookUrl);
    } catch {
      throw new Error("STUDIO_FAL_REQUEST_INVALID: webhook URL is not a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      throw new Error("STUDIO_FAL_REQUEST_INVALID: webhook URL must be https.");
    }
    body.webhook_url = webhookUrl;
  }
  return {
    endpointId: spec.endpointId,
    url: queueUrlForEndpoint(queueBaseUrl, spec.endpointId),
    body,
  };
}
