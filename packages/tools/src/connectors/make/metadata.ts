import {
  defineAction,
  defineAndValidateConnector,
} from "../sdk";

export const MAKE_MANIFEST = defineAndValidateConnector(
  {
    id: "make",
    providerId: "make",
    name: "Make",
    category: "automation",
    description:
      "Build visual automation scenarios with Make (formerly Integromat). Connect Ethen actions to Make scenarios.",
    authType: "api_key",
    state: "not_configured",
  },
  [
    defineAction({
      id: "automation.make_trigger",
      name: "Make Webhook Trigger",
      description:
        "Send data to a Make webhook module to start a scenario run.",
      inputSchema: [
        {
          key: "webhookUrl",
          label: "Make Webhook URL",
          type: "string",
          required: true,
          description: "The Make incoming webhook URL for your scenario.",
        },
        {
          key: "data",
          label: "Data Payload",
          type: "json",
          required: true,
          description: "The data payload to send to Make.",
        },
      ],
      outputSummary: "Make response with scenario execution ID.",
      riskTier: "external_side_effect",
      approvalRequirement: "confirm_every_time",
      state: "not_configured",
    }),
  ],
);

export const { manifest: MAKE_MANIFEST_DATA, validation: MAKE_VALIDATION } =
  MAKE_MANIFEST;
