import { isProductionRuntime } from "@ethen/config/env-contract";

export const SENSITIVE_CACHE_CONTROL = "private, no-store";

export function productionCookieDefaults(
  env: Record<string, string | undefined> = process.env,
): { secure?: boolean; sameSite?: "lax"; httpOnly?: boolean } {
  if (!isProductionRuntime(env)) return {};
  return { secure: true, sameSite: "lax", httpOnly: true };
}

export function mergeCookieOptions<T extends Record<string, unknown>>(
  options: T | undefined,
  env: Record<string, string | undefined> = process.env,
): T & { secure?: boolean; sameSite?: "lax"; httpOnly?: boolean } {
  return {
    ...productionCookieDefaults(env),
    ...(options ?? {}),
  } as T & { secure?: boolean; sameSite?: "lax"; httpOnly?: boolean };
}

export function sensitiveResponseHeaders(): Record<string, string> {
  return {
    "Cache-Control": SENSITIVE_CACHE_CONTROL,
  };
}
