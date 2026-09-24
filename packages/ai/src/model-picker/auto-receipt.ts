import type { AutoRoutingReceipt, ModelPickerOption } from "./types";

export function createAutoRoutingReceipt(input: {
  selectedOptionId: string;
  options: readonly ModelPickerOption[];
  reason: string;
  policy: string;
  now?: Date;
}): AutoRoutingReceipt {
  const option = input.options.find((candidate) => candidate.id === input.selectedOptionId);
  if (!option) throw new Error("Auto selected an option that is absent from the registry-backed picker.");
  if (option.availability !== "available") {
    throw new Error(`Auto cannot select unavailable option ${option.id}.`);
  }
  const reason = input.reason.trim();
  const policy = input.policy.trim();
  if (!reason) throw new Error("Auto selection receipts require a reason.");
  if (!policy) throw new Error("Auto selection receipts require a policy.");
  return {
    type: "ethen.auto_selection.v1",
    selectedOptionId: option.id,
    selectedModelId: option.modelId,
    selectedProviderId: option.providerId,
    reason,
    policy,
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}
