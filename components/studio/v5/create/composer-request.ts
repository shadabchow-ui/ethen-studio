/**
 * STUDIO_M3A — composer request builders (pure, browser-safe).
 *
 * Typed constructors for the four request shapes every generator
 * composer produces: catalog resolve, economics estimate, runtime
 * admission, and the direct-transform stage parameters audio tools
 * admit through /jobs. The create and audio journey hooks build
 * byte-identical bodies through these builders; unit tests pin the
 * shapes so a drift fails closed at the test gate, not at admission.
 */

export interface ResolveRequestInput {
  projectId: string;
  task: string;
  /** "auto" or an explicit endpoint id. */
  modelSelection: string;
  capIcu: number | null;
}

export interface ResolveRequestBody {
  projectId: string;
  task: string;
  mode: "auto" | "explicit";
  capIcu?: number;
  endpointId?: string;
}

/** Catalog resolve body: Auto routes with an optional cap; explicit pins. */
export function buildResolveBody(input: ResolveRequestInput): ResolveRequestBody {
  if (input.modelSelection === "auto") {
    return input.capIcu !== null
      ? { projectId: input.projectId, task: input.task, mode: "auto", capIcu: input.capIcu }
      : { projectId: input.projectId, task: input.task, mode: "auto" };
  }
  return { projectId: input.projectId, task: input.task, mode: "explicit", endpointId: input.modelSelection };
}

export interface EstimateRequestInput {
  projectId: string;
  task: string;
  endpointId: string;
  meterQuantity: number;
  priceVersion: string;
  capIcu: number | null;
}

export interface EstimateRequestBody {
  projectId: string;
  task: string;
  endpointId: string;
  meterQuantity: number;
  priceVersion?: string;
  capIcu?: number;
}

/** Economics estimate body for a resolved endpoint. */
export function buildEstimateBody(input: EstimateRequestInput): EstimateRequestBody {
  return {
    projectId: input.projectId,
    task: input.task,
    endpointId: input.endpointId,
    meterQuantity: input.meterQuantity,
    priceVersion: input.priceVersion || undefined,
    ...(input.capIcu !== null ? { capIcu: input.capIcu } : {}),
  };
}

export interface AdmitRequestInput {
  projectId: string;
  task: string;
  idempotencyKey: string;
  requestHash: string;
  quoteId: string;
  endpointId: string;
  parameters: Readonly<Record<string, unknown>>;
}

export interface AdmitRequestBody {
  projectId: string;
  task: string;
  idempotencyKey: string;
  requestHash: string;
  quoteId: string;
  endpointId: string;
  parameters: Readonly<Record<string, unknown>>;
}

/** Runtime admission body: idempotent, quote-pinned, parameter-complete. */
export function buildAdmitBody(input: AdmitRequestInput): AdmitRequestBody {
  return {
    projectId: input.projectId,
    task: input.task,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    quoteId: input.quoteId,
    endpointId: input.endpointId,
    parameters: input.parameters,
  };
}

export interface DirectTransformInput {
  stage: string;
  parameters: Readonly<Record<string, unknown>>;
  audioProjectId: string;
}

/**
 * Direct-transform stage parameters: the stage's own parameters plus
 * the audio project/stage lineage the runtime needs to settle the
 * transform job against the staged audio project.
 */
export function buildDirectTransformParameters(input: DirectTransformInput): Readonly<Record<string, unknown>> {
  return { ...input.parameters, audioProjectId: input.audioProjectId, audioStage: input.stage };
}
