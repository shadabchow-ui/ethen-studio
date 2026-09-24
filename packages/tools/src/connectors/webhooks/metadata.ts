import {
  defineConnector,
  defineAction,
  defineAndValidateConnector,
} from "../sdk";
import { getWebhookProviderMeta } from "./types";

const webhookMeta = getWebhookProviderMeta();

export const WEBHOOK_INCOMING_MANIFEST = defineConnector(
  {
    id: "webhook-inbound",
    providerId: "webhook-inbound",
    name: "Incoming Webhooks",
    category: "automation",
    description:
      "Receive events from external services via incoming webhooks.",
    authType: "webhook_signing_secret",
    state: webhookMeta.state,
  },
  [
    defineAction({
      id: "automation.webhook_inbound",
      name: "Receive Inbound Webhook",
      description:
        "Accept an incoming webhook payload from an external service, validate its signature, and dispatch it for processing.",
      inputSchema: [
        {
          key: "providerId",
          label: "Provider ID",
          type: "string",
          required: true,
          description: "The registered provider sending this webhook.",
        },
        {
          key: "eventType",
          label: "Event Type",
          type: "string",
          required: true,
          description: "The type of event being delivered (e.g. order.created).",
        },
        {
          key: "payload",
          label: "Payload",
          type: "json",
          required: true,
          description: "The raw webhook payload body.",
        },
      ],
      outputSummary: "Processing status and optional dispatch result.",
      riskTier: "external_side_effect",
      approvalRequirement: "confirm_every_time",
      state: "not_configured",
    }),
  ],
);

export const WEBHOOK_OUTBOUND_MANIFEST = defineConnector(
  {
    id: "webhook-outbound",
    providerId: "webhook-outbound",
    name: "Outgoing Webhooks",
    category: "automation",
    description:
      "Send HTTP callbacks to external services when Ethen actions complete.",
    authType: "none",
    state: "not_configured",
  },
  [
    defineAction({
      id: "automation.webhook_outbound",
      name: "Send Outbound Webhook",
      description:
        "Fire an outgoing webhook to an external URL. Dispatched through the connector runtime and subject to approval for state-changing calls.",
      inputSchema: [
        {
          key: "url",
          label: "Webhook URL",
          type: "string",
          required: true,
          description: "The HTTPS endpoint to deliver the webhook to.",
        },
        {
          key: "payload",
          label: "Payload",
          type: "json",
          required: true,
          description: "JSON payload body.",
        },
        {
          key: "secret",
          label: "Signing Secret",
          type: "string",
          required: false,
          description: "Secret used to sign the outgoing request.",
        },
      ],
      outputSummary: "HTTP status, response body, and timing info.",
      riskTier: "external_side_effect",
      approvalRequirement: "confirm_every_time",
      state: "not_configured",
    }),
  ],
);

export const WEBHOOK_MANIFESTS = [WEBHOOK_INCOMING_MANIFEST, WEBHOOK_OUTBOUND_MANIFEST];

export const { validation: WEBHOOK_VALIDATION } = defineAndValidateConnector(
  {
    id: "webhook-inbound",
    providerId: "webhook-inbound",
    name: "Incoming Webhooks",
    category: "automation",
    description: "Receive events from external services via incoming webhooks.",
    authType: "webhook_signing_secret",
  },
  [],
);
