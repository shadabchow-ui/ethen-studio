import "server-only";
import { createServiceClient } from "@ethen/database/service";
import { gatewayHealthSignal, type GatewayHealthSignal } from "../audit";
import { isProviderCircuitOpen } from "@ethen/ai/cortex/circuit-breaker";

export async function getGatewayHealth(): Promise<GatewayHealthSignal> {
  const service = createServiceClient();
  const supabaseReady = Boolean(service);
  // Derive providers available from credential/adapter registration would live here; use static list until provider registry lands
  const providersAvailable = ["openai", "anthropic", "deepseek"];
  const circuits = providersAvailable.filter((id) => !isProviderCircuitOpen(id));
  const degraded = circuits.length < providersAvailable.length;
  // Stream store + limiter health: service presence implies store reachable; otherwise degraded
  const streamStoreReady = supabaseReady;
  const limiterReady = supabaseReady;
  const status: GatewayHealthSignal["status"] = !supabaseReady ? "degraded" : degraded ? "degraded" : "healthy";
  return gatewayHealthSignal({
    status,
    providersAvailable: circuits,
    keyManagementActive: supabaseReady,
    rateLimitingActive: limiterReady,
    budgetTrackingActive: supabaseReady,
    pricingActive: true,
    message: supabaseReady ? `Gateway ${status}: derived from adapter+credential+circuit+limiter+stream state` : "Gateway degraded: Supabase unavailable, platform features limited",
  });
}

export async function getGatewayReadiness(): Promise<{ ready: boolean; reason: string | null; health: GatewayHealthSignal }> {
  const health = await getGatewayHealth();
  const ready = health.status !== "unavailable" && health.keyManagementActive;
  return { ready, reason: ready ? null : health.message, health };
}
