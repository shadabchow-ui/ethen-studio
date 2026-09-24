/** Studio V5 gateway — settings section state projector (STUDIO_19). Server-only. */
import "server-only";

export type GatewaySettingsState = "loading" | "error" | "forbidden" | "empty" | "ready";

export interface GatewaySettingsInput {
  loading: boolean;
  error: string | null;
  forbidden: boolean;
  keyCount: number;
  subscriptionCount: number;
}

export interface GatewaySettingsView {
  state: GatewaySettingsState;
  heading: string;
  hint: string | null;
}

export const GATEWAY_SETTINGS_COPY: Record<GatewaySettingsState, { heading: string; hint: string | null }> = {
  loading: { heading: "Loading API access…", hint: null },
  error: { heading: "API access is unavailable", hint: "Retry, or check Studio status if this persists." },
  forbidden: { heading: "API access needs admin rights", hint: "Ask a workspace admin to manage keys and webhooks." },
  empty: { heading: "No API keys yet", hint: "Mint a scoped key to call the V1 gateway, or register a webhook." },
  ready: { heading: "API keys and webhooks", hint: null },
};

/** Pure loading → error → forbidden → empty → ready projection for the settings section. */
export function projectGatewaySettings(input: GatewaySettingsInput): GatewaySettingsView {
  if (input.loading) return { state: "loading", ...GATEWAY_SETTINGS_COPY["loading"] };
  if (input.error) return { state: "error", ...GATEWAY_SETTINGS_COPY["error"] };
  if (input.forbidden) return { state: "forbidden", ...GATEWAY_SETTINGS_COPY["forbidden"] };
  if (input.keyCount === 0 && input.subscriptionCount === 0) {
    return { state: "empty", ...GATEWAY_SETTINGS_COPY["empty"] };
  }
  return { state: "ready", ...GATEWAY_SETTINGS_COPY["ready"] };
}
