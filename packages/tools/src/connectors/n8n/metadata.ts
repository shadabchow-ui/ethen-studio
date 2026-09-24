import {
  defineAction,
  defineAndValidateConnector,
} from "../sdk";

export const N8N_MANIFEST = defineAndValidateConnector(
  {
    id: "n8n",
    providerId: "n8n",
    name: "n8n",
    category: "automation",
    description:
      "Connect Ethen to self-hosted or cloud n8n workflows. Send data to n8n webhook nodes.",
    authType: "api_key",
    state: "not_configured",
  },
  [
    defineAction({
      id: "automation.n8n_trigger",
      name: "n8n Webhook Trigger",
      description:
        "Send data to an n8n webhook node to trigger a workflow execution.",
      inputSchema: [
        {
          key: "webhookUrl",
          label: "n8n Webhook URL",
          type: "string",
          required: true,
          description: "The n8n webhook node production URL.",
        },
        {
          key: "data",
          label: "Data Payload",
          type: "json",
          required: true,
          description: "The data payload to send to n8n.",
        },
      ],
      outputSummary: "n8n response with workflow execution status.",
      riskTier: "external_side_effect",
      approvalRequirement: "confirm_every_time",
      state: "not_configured",
    }),
  ],
);

export const { manifest: N8N_MANIFEST_DATA, validation: N8N_VALIDATION } =
  N8N_MANIFEST;
