import type { GatewayCatalogModelRecord } from "@ethen/models/gateway/model-catalog/types";
import type {
  LocalModelRuntimeStatus,
  LocalModelSummary,
} from "@ethen/models/local/types";
import { LOCAL_MODELS_DEFAULT_BASE_URL } from "@ethen/models/local/types";
import { getPriceRecordState } from "@ethen/models/pricing-registry";
import {
  ADAPTER_CERTIFICATION_RECEIPTS,
  getCurrentCertification,
} from "@ethen/models/runtime/certification-receipts";
import { isCertificationCurrent } from "@ethen/models/runtime/certification";
import type { ModelPickerOption } from "./types";

function certificationFor(
  providerId: string,
  now: Date,
  scope: "gateway" | "local_read_only" = "gateway",
) {
  const receipt = scope === "gateway"
    ? getCurrentCertification(providerId, now)
    : ADAPTER_CERTIFICATION_RECEIPTS.find((candidate) =>
        candidate.providerId === providerId &&
        candidate.scope === scope &&
        isCertificationCurrent(candidate, now),
      ) ?? null;
  if (receipt) {
    return {
      state: "current" as const,
      label: `Certified until ${receipt.expiresAt}`,
      expiresAt: receipt.expiresAt,
    };
  }
  const latestExpired = ADAPTER_CERTIFICATION_RECEIPTS
    .filter((candidate) =>
      candidate.providerId === providerId &&
      candidate.scope === scope &&
      candidate.result === "pass" &&
      Date.parse(candidate.expiresAt) <= now.getTime(),
    )
    .sort((left, right) => Date.parse(right.expiresAt) - Date.parse(left.expiresAt))[0];
  if (latestExpired) {
    return {
      state: "expired" as const,
      label: `Certification expired at ${latestExpired.expiresAt}`,
      expiresAt: latestExpired.expiresAt,
    };
  }
  return {
    state: "uncertified" as const,
    label: "Uncertified or certification expired",
    expiresAt: null,
  };
}

export function buildHostedModelPickerOptions(
  models: readonly GatewayCatalogModelRecord[],
  now = new Date(),
): ModelPickerOption[] {
  return models.map((model) => {
    const providerId = model.runtimeProviderId ?? model.providerSlug;
    const price = getPriceRecordState(model.model_id, now);
    const available = model.status.kind === "runnable";
    return {
      id: `hosted:${model.model_id}`,
      registryId: model.model_id,
      kind: "hosted",
      modelId: model.model_id,
      label: model.model_name ?? model.model_id,
      providerId,
      providerLabel: model.status.providerLabel ?? model.provider,
      availability: available ? "available" : "unavailable",
      unavailableReason: available ? null : model.status.detail,
      certification: certificationFor(providerId, now),
      pricing: {
        state: price.state,
        label: price.message,
        expiresAt: price.record?.expiresAt ?? null,
      },
      runtime: null,
    };
  });
}

export function buildLocalRuntimePickerOptions(input: {
  status: LocalModelRuntimeStatus;
  models: readonly LocalModelSummary[];
  now?: Date;
}): ModelPickerOption[] {
  const healthy = input.status.provider === "ollama" &&
    input.status.detected &&
    input.status.state === "detected";
  const certification = certificationFor(
    "ollama",
    input.now ?? new Date(),
    "local_read_only",
  );
  return input.models.map((model) => ({
    id: `local:${model.provider}:${model.id}`,
    registryId: `${model.provider}:${model.id}`,
    kind: "local-runtime",
    modelId: model.model,
    label: model.name,
    providerId: model.provider,
    providerLabel: model.provider === "ollama" ? "Ollama" : model.provider,
    availability: healthy ? "available" : "unavailable",
    unavailableReason: healthy ? null : input.status.detail,
    certification,
    pricing: {
      state: "missing",
      label: "Local runtime pricing is not applicable.",
      expiresAt: null,
    },
    runtime: {
      health: input.status.state,
      detail: input.status.detail,
      endpoint: LOCAL_MODELS_DEFAULT_BASE_URL,
      authentication: "No built-in authentication",
      readOnlyCertification: certification.state === "current",
    },
  }));
}

export function assertRegistryBackedOptions(
  options: readonly ModelPickerOption[],
  registryIds: ReadonlySet<string>,
): void {
  for (const option of options) {
    if (!registryIds.has(option.registryId)) {
      throw new Error(`Picker option ${option.id} is not backed by the supplied registry.`);
    }
  }
}
