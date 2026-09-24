/**
 * BILL-IMPL-01 domain contracts: the bounded subscription state model,
 * BillingOverview DTO, error envelope, and price-catalog schema defined by
 * docs/v2-migration/checkpoints/BILL-ARCH-01.md.
 *
 * No "server-only" import here: BillingOverview and the error shape are
 * consumed by the client BillingPage component as well as server routes.
 */

// ── Subscription state ──────────────────────────────────────────────────────

/**
 * The only subscription states application code may branch on. Raw Stripe
 * status strings are mapped into this set by lib/billing/projection.ts and
 * never surfaced past it.
 */
export type SubscriptionState =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "suspended";

/** Stripe subscription.status -> bounded SubscriptionState. */
export function mapStripeSubscriptionStatus(status: string): SubscriptionState {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
    case "paused":
      return "suspended";
    case "incomplete":
    case "incomplete_expired":
    default:
      return "inactive";
  }
}

/** Paid capabilities are granted only for the two approved bounded states. */
export function capabilitiesForSubscriptionState<T extends { capabilities: string[]; limits: Record<string, number> }>(
  state: SubscriptionState,
  offer: T | undefined,
): { capabilities: string[]; limits: Record<string, number> } {
  if ((state !== "active" && state !== "trialing") || !offer) return { capabilities: [], limits: {} };
  return { capabilities: offer.capabilities, limits: offer.limits };
}

/** Paid projections are usable only while their provider period is current. */
export function isPaidProjectionFresh(
  state: SubscriptionState,
  currentPeriodEnd: string | null | undefined,
  now = new Date(),
): boolean {
  if (state !== "active" && state !== "trialing") return true;
  if (!currentPeriodEnd) return false;
  const end = Date.parse(currentPeriodEnd);
  return Number.isFinite(end) && end > now.getTime();
}

export interface ProviderEventOrder {
  id: string;
  createdAt: string;
  authoritative?: boolean;
}

/** Deterministic event-level ordering for provider projections. */
export function shouldApplyProviderEvent(
  existing: { last_provider_event_created_at?: string | null; last_provider_event_id?: string | null } | null,
  incoming: ProviderEventOrder,
): boolean {
  if (incoming.authoritative || !existing?.last_provider_event_created_at) return true;
  const previous = Date.parse(existing.last_provider_event_created_at);
  const next = Date.parse(incoming.createdAt);
  if (!Number.isFinite(next)) return false;
  if (next !== previous) return next > previous;
  return incoming.id > (existing.last_provider_event_id ?? "");
}

/** Validate the deployment-owned Checkout/portal return origin. */
export function parseBillingAppOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

// ── BillingOverview DTO ──────────────────────────────────────────────────────

export type BillingReadiness = "not_configured" | "available" | "unavailable";

export interface BillingSubscriptionSummary {
  state: SubscriptionState;
  planKey: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingCreditLedgerEntry {
  id: string;
  created_at: string;
  entry_type: "grant" | "purchase" | "usage" | "refund" | "adjustment";
  amount: number;
  note: string | null;
}

export interface BillingUsageEventSummary {
  id: string;
  created_at: string;
  summary: string;
}

/** Safe, provider-neutral Checkout choice. Provider price IDs stay server-only. */
export interface BillingCheckoutOfferSummary {
  offerKey: string;
  planKey: string;
  mode: "subscription" | "payment";
}

export interface BillingEntitlements {
  readiness: BillingReadiness;
  state: SubscriptionState;
  planKey: string | null;
  capabilities: string[];
  limits: Record<string, number>;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Catalog limit keys accepted from STRIPE_PRICE_CATALOG_JSON.limits. */
export const ENTITLEMENT_LIMIT_ALIASES: Record<string, readonly string[]> = {
  "beta-daily-messages": ["beta-daily-messages", "daily_messages", "messages_per_day"],
  "beta-daily-research-runs": ["beta-daily-research-runs", "daily_research_runs", "research_runs_per_day"],
  "beta-daily-coding-runs": ["beta-daily-coding-runs", "daily_coding_runs", "coding_runs_per_day"],
  "beta-daily-founder-runs": ["beta-daily-founder-runs", "daily_founder_runs", "founder_runs_per_day"],
  "beta-hourly-voice-transcribe": ["beta-hourly-voice-transcribe", "hourly_voice_transcribe"],
  "beta-hourly-voice-speech": ["beta-hourly-voice-speech", "hourly_voice_speech"],
  "beta-hourly-voice-realtime": ["beta-hourly-voice-realtime", "hourly_voice_realtime"],
};

/** Paid capabilities are granted only from a fresh active/trialing projection. */
export function hasPaidCapability(
  entitlements: BillingEntitlements,
  capability: string,
): boolean {
  if (entitlements.readiness !== "available") return false;
  if (entitlements.state !== "active" && entitlements.state !== "trialing") return false;
  return entitlements.capabilities.includes(capability);
}

/**
 * Overlay a catalog limit onto the beta default. Missing billing or missing
 * catalog keys keep the existing beta cap.
 */
export function overlayUsageLimitMax(
  limitId: string,
  defaultMax: number,
  entitlements: BillingEntitlements | null,
): number {
  if (!entitlements || entitlements.readiness !== "available") return defaultMax;
  if (entitlements.state !== "active" && entitlements.state !== "trialing") return defaultMax;
  const keys = ENTITLEMENT_LIMIT_ALIASES[limitId] ?? [limitId];
  for (const key of keys) {
    const value = entitlements.limits[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  }
  return defaultMax;
}

export interface BillingOverview {
  readiness: BillingReadiness;
  subscription: BillingSubscriptionSummary | null;
  credits: {
    balance: number | null;
    ledger: BillingCreditLedgerEntry[];
  };
  usage: {
    recentEvents: BillingUsageEventSummary[];
  };
  actions: {
    checkoutAvailable: boolean;
    portalAvailable: boolean;
    checkoutOffers: BillingCheckoutOfferSummary[];
  };
  notice: string | null;
}

// ── Error envelope ───────────────────────────────────────────────────────────

export type BillingErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_REQUEST"
  | "BILLING_NOT_CONFIGURED"
  | "CUSTOMER_NOT_PROVISIONED"
  | "PLAN_NOT_AVAILABLE"
  | "CHECKOUT_UNAVAILABLE"
  | "PORTAL_UNAVAILABLE"
  | "WEBHOOK_INVALID"
  | "PROVIDER_UNAVAILABLE";

const BILLING_ERROR_STATUS: Record<BillingErrorCode, number> = {
  AUTH_REQUIRED: 401,
  INVALID_REQUEST: 400,
  BILLING_NOT_CONFIGURED: 503,
  CUSTOMER_NOT_PROVISIONED: 409,
  PLAN_NOT_AVAILABLE: 409,
  CHECKOUT_UNAVAILABLE: 503,
  PORTAL_UNAVAILABLE: 503,
  WEBHOOK_INVALID: 400,
  PROVIDER_UNAVAILABLE: 503,
};

export interface BillingErrorBody {
  ok: false;
  error: BillingErrorCode;
  code: BillingErrorCode;
}

export function billingErrorResponse(code: BillingErrorCode): {
  status: number;
  body: BillingErrorBody;
} {
  return { status: BILLING_ERROR_STATUS[code], body: { ok: false, error: code, code } };
}

// ── Price catalog ────────────────────────────────────────────────────────────

export interface PriceCatalogEntry {
  offerKey: string;
  stripePriceId: string;
  planKey: string;
  mode: "subscription" | "payment";
  capabilities: string[];
  limits: Record<string, number>;
  /** Deployment-configured credits for a confirmed one-time purchase only. */
  creditAmount: number | null;
}

/**
 * Parses STRIPE_PRICE_CATALOG_JSON. Never throws — malformed or missing
 * catalog data must fail closed (no offers available), not crash a route.
 */
export function parsePriceCatalog(json: string): PriceCatalogEntry[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const entries: PriceCatalogEntry[] = [];
  for (const item of parsed) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).offerKey !== "string" ||
      typeof (item as Record<string, unknown>).stripePriceId !== "string" ||
      typeof (item as Record<string, unknown>).planKey !== "string" ||
      ((item as Record<string, unknown>).mode !== "subscription" &&
        (item as Record<string, unknown>).mode !== "payment")
    ) {
      return null;
    }
    const record = item as Record<string, unknown>;
    const capabilities = Array.isArray(record.capabilities)
      ? record.capabilities.filter((c): c is string => typeof c === "string")
      : [];
    const limits: Record<string, number> =
      record.limits && typeof record.limits === "object" && !Array.isArray(record.limits)
        ? Object.fromEntries(
            Object.entries(record.limits as Record<string, unknown>).filter(
              ([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0,
            ),
          ) as Record<string, number>
        : {};
    const creditAmount =
      typeof record.creditAmount === "number" &&
      Number.isInteger(record.creditAmount) &&
      record.creditAmount > 0
        ? record.creditAmount
        : null;
    entries.push({
      offerKey: record.offerKey as string,
      stripePriceId: record.stripePriceId as string,
      planKey: record.planKey as string,
      mode: record.mode as "subscription" | "payment",
      capabilities,
      limits,
      creditAmount,
    });
  }
  return entries;
}
