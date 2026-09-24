import {
  defineAction,
  defineAndValidateConnector,
} from "../sdk";

export const ZAPIER_MANIFEST = defineAndValidateConnector(
  {
    id: "zapier",
    providerId: "zapier",
    name: "Zapier",
    category: "automation",
    description:
      "Connect Ethen to thousands of apps via Zapier. Trigger zaps and send data to 7,000+ integrations.",
    authType: "api_key",
    state: "not_configured",
  },
  [
    defineAction({
      id: "automation.zapier_trigger",
      name: "Zapier Webhook Trigger",
      description:
        "Trigger a Zapier zap by posting data to a catch webhook URL.",
      inputSchema: [
        {
          key: "zapUrl",
          label: "Zap Webhook URL",
          type: "string",
          required: true,
          description: "The Zapier catch webhook or REST hook URL.",
        },
        {
          key: "data",
          label: "Data Payload",
          type: "json",
          required: true,
          description: "The data to send to the Zap.",
        },
      ],
      outputSummary: "Zapier response status and zap run ID when available.",
      riskTier: "external_side_effect",
      approvalRequirement: "confirm_every_time",
      state: "not_configured",
    }),
  ],
);

export const { manifest: ZAPIER_MANIFEST_DATA, validation: ZAPIER_VALIDATION } =
  ZAPIER_MANIFEST;
