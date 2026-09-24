import type {
  GatewayChatRequest,
  GatewayProviderId,
  GatewayProviderRoute,
  GatewayStreamResult,
} from "./gateway/types";

export interface ProviderAvailability {
  available: boolean;
  missingEnv?: string;
  /** Human-readable reason when available is false. */
  reason?: string;
}

export interface ProviderAdapter {
  providerId: GatewayProviderId;
  label: string;
  getAvailability(): ProviderAvailability;
  streamChat(input: {
    request: GatewayChatRequest;
    route: GatewayProviderRoute;
    /** BYOK API key override — when provided, takes precedence over environment-configured key. */
    apiKeyOverride?: string | null;
    /**
     * Optional abort signal. Adapters should thread it into the upstream
     * `fetch` so that a provider timeout or client cancellation can abort
     * the in-flight provider request. Adapters that cannot forward the
     * signal may ignore it; the gateway still enforces the deadline.
     */
    signal?: AbortSignal;
  }): Promise<GatewayStreamResult>;
}
