import type { ProviderId } from "../types";

export type IncomingWebhookState =
  | "configured"
  | "not_configured"
  | "disabled";

export interface WebhookProviderMeta {
  providerId: ProviderId;
  state: IncomingWebhookState;
  reason?: string;
}

export interface IncomingWebhookPayload {
  providerId: ProviderId;
  eventType: string;
  payload: Record<string, unknown>;
  signatureHeader?: string;
  timestamp?: string;
}

export interface WebhookProcessingResult {
  accepted: boolean;
  status: number;
  message: string;
  actionDispatched?: boolean;
  executionId?: string;
}

export function getWebhookProviderMeta(): WebhookProviderMeta {
  return {
    providerId: "webhook-inbound",
    state: "not_configured",
    reason:
      "No webhook signing secret or verification pattern is configured. " +
      "Set a signing secret and implement signature validation to enable incoming webhooks.",
  };
}
