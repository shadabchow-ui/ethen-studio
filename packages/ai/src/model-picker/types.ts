export type ModelPickerOptionKind = "hosted" | "local-runtime";
export type ModelPickerAvailability = "available" | "unavailable";
export type CertificationPresentation = "current" | "expired" | "uncertified";
export type PricePresentation = "current" | "stale" | "missing";

export interface ModelPickerOption {
  id: string;
  registryId: string;
  kind: ModelPickerOptionKind;
  modelId: string;
  label: string;
  providerId: string;
  providerLabel: string;
  availability: ModelPickerAvailability;
  unavailableReason: string | null;
  certification: {
    state: CertificationPresentation;
    label: string;
    expiresAt: string | null;
  };
  pricing: {
    state: PricePresentation;
    label: string;
    expiresAt: string | null;
  };
  runtime: {
    health: string;
    detail: string;
    endpoint: string;
    authentication: string;
    readOnlyCertification: boolean;
  } | null;
}

export interface AutoRoutingReceipt {
  type: "ethen.auto_selection.v1";
  selectedOptionId: string;
  selectedModelId: string;
  selectedProviderId: string;
  reason: string;
  policy: string;
  createdAt: string;
}
