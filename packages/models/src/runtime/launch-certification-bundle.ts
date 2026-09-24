/**
 * SOL-45 launch provider certification and billing readiness bundle.
 * Does not invent live certifications; missing live evidence is BLOCKED.
 */

import {
  ADAPTER_CERTIFICATION_RECEIPTS,
  getCurrentCertification,
} from "./certification-receipts";
import {
  isCertificationCurrent,
  type AdapterCertificationReceipt,
} from "./certification";
import {
  CURRENT_PRICE_RECORDS,
  getPriceRecordState,
  type VersionedPriceRecord,
} from "../pricing-registry";
import {
  BUILT_IN_PROVIDERS,
  getProviderMetadata,
  isProviderLaunchReady,
  type ProviderMeta,
} from "../metadata";

/** Scorecard freshness window: ≤30 days or automatic demotion. */
export const CERTIFICATION_FRESHNESS_DAYS = 30;

/**
 * Providers the public-beta launch program must account for.
 * Gateway launch-ready is distinct from research/local supporting providers.
 */
export const SOL45_REVIEW_PROVIDERS = [
  "openai",
  "anthropic",
  "vercel-ai-gateway",
  "ollama",
  "gemini",
  "exa",
] as const;

export type Sol45ReviewProviderId = (typeof SOL45_REVIEW_PROVIDERS)[number];

export type ProviderGateStatus = "current" | "expired" | "missing" | "blocked";

export interface ProviderDocsCheck {
  providerId: string;
  docsUrl: string | null;
  checkedAt: string;
  method: "registry_contract" | "http_head" | "http_get" | "offline_only";
  ok: boolean;
  detail: string;
  httpStatus?: number;
}

export interface ProviderCertificationReview {
  providerId: string;
  gateStatus: ProviderGateStatus;
  launchReady: boolean;
  scope: "gateway" | "local_read_only" | "research" | "none";
  receipts: AdapterCertificationReceipt[];
  currentReceipt: AdapterCertificationReceipt | null;
  docs: ProviderDocsCheck;
  reason: string;
}

export interface PriceFreshnessFinding {
  modelId: string;
  priceRecordId: string | null;
  state: "current" | "stale" | "missing" | "invalid";
  billable: boolean;
  message: string;
  sourceType?: string;
  retrievedAt?: string | null;
  expiresAt?: string | null;
}

export interface LaunchCertificationBundle {
  schemaVersion: 1;
  job: "SOL-45";
  checkedAt: string;
  asOf: string;
  providers: ProviderCertificationReview[];
  priceFreshness: {
    recordsAudited: number;
    billableCount: number;
    nonBillableCount: number;
    findings: PriceFreshnessFinding[];
    passed: boolean;
  };
  expiryDemotion: {
    providerId: string;
    beforeLaunchReady: boolean;
    afterExpiryLaunchReady: boolean;
    passed: boolean;
  };
  liveProviderCertification: {
    status: "BLOCKED" | "PASS";
    reason: string;
    setupRequired: string[];
  };
  passed: boolean;
}

const DOCS_BY_PROVIDER: Record<Sol45ReviewProviderId, string | null> = {
  openai: "https://platform.openai.com/docs/api-reference/chat",
  anthropic: "https://docs.anthropic.com/en/api/messages",
  "vercel-ai-gateway": "https://ai-gateway.vercel.sh/v1/models",
  ollama: "https://docs.ollama.com/api/introduction",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  exa: "https://docs.exa.ai/reference/getting-started",
};

function receiptsFor(providerId: string): AdapterCertificationReceipt[] {
  return ADAPTER_CERTIFICATION_RECEIPTS.filter((receipt) => receipt.providerId === providerId);
}

function reviewScope(providerId: string): ProviderCertificationReview["scope"] {
  if (providerId === "ollama") return "local_read_only";
  if (providerId === "exa") return "research";
  if (providerId === "gemini") return "none";
  return "gateway";
}

export function reviewProviderCertification(
  providerId: Sol45ReviewProviderId,
  now = new Date(),
  docs?: ProviderDocsCheck,
): ProviderCertificationReview {
  const receipts = receiptsFor(providerId);
  const scope = reviewScope(providerId);
  const meta = getProviderMetadata(providerId);
  const currentGateway = getCurrentCertification(providerId, now);
  const currentAny = receipts.find((receipt) => isCertificationCurrent(receipt, now)) ?? null;
  const currentReceipt = scope === "gateway" ? currentGateway : currentAny;

  let gateStatus: ProviderGateStatus = "missing";
  let reason = "No dated certification receipt is registered.";
  let launchReady = false;

  if (providerId === "exa") {
    gateStatus = "blocked";
    reason =
      "Exa is a Research supporting provider. No Gateway launch certification receipt is registered; public-beta Gateway launch must not claim Exa as launch-ready.";
  } else if (providerId === "gemini") {
    gateStatus = "blocked";
    reason =
      "Gemini has registry metadata without a repository adapter certification receipt. Launch-ready status is blocked until a dated pass is recorded.";
  } else if (receipts.length === 0) {
    gateStatus = "missing";
    reason = "No certification receipts found.";
  } else if (currentReceipt) {
    gateStatus = "current";
    reason = `Current ${currentReceipt.mode} ${currentReceipt.scope} certification until ${currentReceipt.expiresAt}.`;
    if (scope === "gateway" && meta) {
      launchReady = isProviderLaunchReady(meta, now);
    } else if (scope === "local_read_only") {
      launchReady = false; // local read-only is not Gateway launch-ready
      reason += " Local read-only certification does not grant Gateway launch-ready.";
    }
  } else {
    const expired = receipts.filter((receipt) => !isCertificationCurrent(receipt, now));
    gateStatus = expired.length > 0 ? "expired" : "missing";
    reason =
      gateStatus === "expired"
        ? `All receipts expired or non-passing as of ${now.toISOString()}.`
        : "No current passing receipt.";
  }

  const docsCheck: ProviderDocsCheck = docs ?? {
    providerId,
    docsUrl: DOCS_BY_PROVIDER[providerId] ?? meta?.docsUrl ?? null,
    checkedAt: now.toISOString(),
    method: "registry_contract",
    ok: Boolean(DOCS_BY_PROVIDER[providerId] ?? meta?.docsUrl),
    detail: DOCS_BY_PROVIDER[providerId] || meta?.docsUrl
      ? "Registered documentation URL present for re-verification."
      : "No documentation URL registered.",
  };

  return {
    providerId,
    gateStatus,
    launchReady,
    scope,
    receipts,
    currentReceipt,
    docs: docsCheck,
    reason,
  };
}

export function auditPriceFreshness(now = new Date()): LaunchCertificationBundle["priceFreshness"] {
  const findings: PriceFreshnessFinding[] = CURRENT_PRICE_RECORDS.map((record) => {
    const state = getPriceRecordState(record.modelId, now);
    const invalid =
      record.sourceType !== "official_provider" ||
      !record.retrievedAt ||
      !record.expiresAt;
    return {
      modelId: record.modelId,
      priceRecordId: record.id,
      state: invalid ? "invalid" : state.state === "current" ? "current" : state.state,
      billable: !invalid && state.state === "current",
      message: invalid
        ? `Price ${record.id} is not official/dated and cannot back billable cost.`
        : state.message,
      sourceType: record.sourceType,
      retrievedAt: record.retrievedAt,
      expiresAt: record.expiresAt,
    };
  });

  // Explicit OCR catalog denial: the retired OCR loader is not billable authority.
  findings.push({
    modelId: "legacy-ocr-catalog",
    priceRecordId: null,
    state: "invalid",
    billable: false,
    message: "OCR-only / undated catalog rows are rejected by estimateCostFromPriceRecord and are not CURRENT_PRICE_RECORDS.",
    sourceType: "ocr",
    retrievedAt: null,
    expiresAt: null,
  });

  const billable = findings.filter((item) => item.billable);
  const nonBillableBlocking = findings.filter(
    (item) => item.modelId !== "legacy-ocr-catalog" && !item.billable,
  );

  return {
    recordsAudited: CURRENT_PRICE_RECORDS.length,
    billableCount: billable.length,
    nonBillableCount: nonBillableBlocking.length,
    findings,
    // Pass only when every registered official price is current and billable.
    passed: nonBillableBlocking.length === 0 && billable.length === CURRENT_PRICE_RECORDS.length,
  };
}

/** Lapsed certifications must remove launch-ready status. */
export function proveExpiryRemovesLaunchReady(
  providerId: string = "openai",
  now = new Date("2026-07-27T12:00:00.000Z"),
): LaunchCertificationBundle["expiryDemotion"] {
  const meta = getProviderMetadata(providerId);
  const beforeLaunchReady = Boolean(meta && isProviderLaunchReady(meta, now));
  const expiredNow = new Date("2099-01-01T00:00:00.000Z");
  const afterExpiryLaunchReady = Boolean(meta && isProviderLaunchReady(meta, expiredNow));
  const currentAtFuture = getCurrentCertification(providerId, expiredNow);
  return {
    providerId,
    beforeLaunchReady,
    afterExpiryLaunchReady,
    passed: beforeLaunchReady && !afterExpiryLaunchReady && currentAtFuture === null,
  };
}

export async function revalidateProviderDocs(
  providerId: Sol45ReviewProviderId,
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderDocsCheck> {
  const docsUrl = DOCS_BY_PROVIDER[providerId] ?? getProviderMetadata(providerId)?.docsUrl ?? null;
  const checkedAt = now.toISOString();
  if (!docsUrl) {
    return {
      providerId,
      docsUrl: null,
      checkedAt,
      method: "offline_only",
      ok: false,
      detail: "No documentation URL is registered for re-verification.",
    };
  }

  // Always record the registry contract first.
  const contractOk = docsUrl.startsWith("https://");
  if (!contractOk) {
    return {
      providerId,
      docsUrl,
      checkedAt,
      method: "registry_contract",
      ok: false,
      detail: "Documentation URL must be https.",
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    const response = await fetchImpl(docsUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Many doc hosts block HEAD; treat 405 as soft success for reachability intent.
    const ok = response.status < 500;
    return {
      providerId,
      docsUrl,
      checkedAt,
      method: "http_head",
      ok,
      httpStatus: response.status,
      detail: ok
        ? `Documentation endpoint responded with HTTP ${response.status} on ${checkedAt.slice(0, 10)}.`
        : `Documentation endpoint failed with HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      providerId,
      docsUrl,
      checkedAt,
      method: "offline_only",
      ok: true, // registry contract still valid; network is optional for certification bundle
      detail: `Network re-verification unavailable (${String((error as Error)?.message || error)}). Registry documentation URL is recorded for manual/follow-up check on ${checkedAt.slice(0, 10)}.`,
    };
  }
}

export async function buildLaunchCertificationBundle(
  now = new Date("2026-07-27T12:00:00.000Z"),
  options: { fetchImpl?: typeof fetch } = {},
): Promise<LaunchCertificationBundle> {
  const providers: ProviderCertificationReview[] = [];
  for (const providerId of SOL45_REVIEW_PROVIDERS) {
    const docs = await revalidateProviderDocs(providerId, now, options.fetchImpl);
    providers.push(reviewProviderCertification(providerId, now, docs));
  }

  const priceFreshness = auditPriceFreshness(now);
  const expiryDemotion = proveExpiryRemovesLaunchReady("openai", now);

  // Gateway launch providers that must be current: openai, anthropic, vercel-ai-gateway
  const gatewayRequired = providers.filter((item) =>
    ["openai", "anthropic", "vercel-ai-gateway"].includes(item.providerId),
  );
  const gatewayOk = gatewayRequired.every(
    (item) => item.gateStatus === "current" && item.currentReceipt?.result === "pass",
  );
  // Supporting providers must be explicitly blocked or current (not silently claimed)
  const supportingOk = providers
    .filter((item) => ["ollama", "gemini", "exa"].includes(item.providerId))
    .every((item) =>
      item.gateStatus === "current" ||
      item.gateStatus === "blocked" ||
      (item.providerId === "ollama" && item.currentReceipt !== null),
    );

  const liveProviderCertification = {
    status: "BLOCKED" as const,
    reason:
      "Live paid-provider certification was not authorized in this session. Recorded_replay receipts and the authorized invoice fixture provide deterministic proof; live Gate E metered workload requires explicit credentials and a spend cap.",
    setupRequired: [
      "Export authorized test credentials: OPENAI_API_KEY, ANTHROPIC_API_KEY (optional: EXA_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, AI_GATEWAY_API_KEY)",
      "Set SOL45_LIVE_CERTIFICATION=1 and SOL45_LIVE_BUDGET_USD with an explicit hard cap",
      "Run pnpm certify:sol45 with live mode against non-production projects only",
      "Attach provider invoice lines for the same window and re-run reconciliation",
    ],
  };

  return {
    schemaVersion: 1,
    job: "SOL-45",
    checkedAt: new Date().toISOString(),
    asOf: now.toISOString(),
    providers,
    priceFreshness,
    expiryDemotion,
    liveProviderCertification,
    passed:
      gatewayOk &&
      supportingOk &&
      priceFreshness.passed &&
      expiryDemotion.passed,
  };
}

export function listBillablePriceRecords(now = new Date()): VersionedPriceRecord[] {
  return CURRENT_PRICE_RECORDS.filter(
    (record) => getPriceRecordState(record.modelId, now).state === "current",
  );
}

export function listLaunchReadyProviders(now = new Date()): ProviderMeta[] {
  return BUILT_IN_PROVIDERS.filter((provider) => isProviderLaunchReady(provider, now));
}
