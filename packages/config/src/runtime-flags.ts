import { hasConfiguredSupabasePublicEnv } from "./env";
import { isMockModeAllowed } from "./env-contract";

// Production-proof: isMockModeAllowed requires
// VERCEL_ENV !== "production" && NODE_ENV !== "production"
export const isMockMode: boolean = isMockModeAllowed();

export function hasSupabaseEnv() {
  return hasConfiguredSupabasePublicEnv();
}
