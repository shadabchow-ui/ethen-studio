import "server-only";

import { getServerEnv, hasConfiguredServerEnv } from "@ethen/config/env";
import { parseBillingAppOrigin, parsePriceCatalog, type PriceCatalogEntry } from "./domain";

export function isBillingConfigured(): boolean {
  return (
    hasConfiguredServerEnv("STRIPE_SECRET_KEY") &&
    hasConfiguredServerEnv("STRIPE_WEBHOOK_SECRET") &&
    Boolean(getBillingAppOrigin())
  );
}

export function getBillingAppOrigin(): string | null {
  return parseBillingAppOrigin(getServerEnv("NEXT_PUBLIC_APP_URL"));
}

let cachedCatalog: PriceCatalogEntry[] | undefined;

/** Parsed STRIPE_PRICE_CATALOG_JSON. Returns [] when unset or malformed. */
export function getPriceCatalog(): PriceCatalogEntry[] {
  if (cachedCatalog !== undefined) return cachedCatalog;

  const raw = getServerEnv("STRIPE_PRICE_CATALOG_JSON");
  cachedCatalog = raw ? (parsePriceCatalog(raw) ?? []) : [];
  return cachedCatalog;
}

export function resolveOffer(offerKey: string): PriceCatalogEntry | null {
  return getPriceCatalog().find((entry) => entry.offerKey === offerKey) ?? null;
}
