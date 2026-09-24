/**
 * @ethen/security — shared perimeter policy (U01 trust/data extraction).
 *
 * Canonical source for the route-prefix gates enforced by the root proxy
 * and by every split frontend's middleware delegate. Values moved verbatim
 * from proxy.ts so behavior is identical; proxy.ts now imports from here.
 *
 * No product routes are moved by this extraction.
 */

/** API routes serving sensitive internal data (coding runs, agent sessions, gateway logs, sentinel findings, etc.). */
export const SENSITIVE_API_PREFIXES: ReadonlyArray<string> = [
  "/api/coding",
  "/api/agent-sessions",
  "/api/agents",
  "/api/gateway/logs",
  "/api/gateway/usage",
  "/api/gateway/keys",
  "/api/sentinel",
  "/api/cortex/ultra-benchmark",
  "/api/retrieval",
];

/** Internal page/operations surfaces gated to authenticated callers. */
export const INTERNAL_ROUTE_PREFIXES: ReadonlyArray<string> = [
  "/operator",
  "/observability",
  "/billing",
  "/audit-log",
  "/projects",
];

export function isSensitiveApiRoute(pathname: string): boolean {
  return SENSITIVE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isInternalRoute(pathname: string): boolean {
  return INTERNAL_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isDevRoute(pathname: string): boolean {
  return pathname === "/dev" || pathname.startsWith("/dev/");
}

/** The nine Next.js frontend deployables that must each ship a middleware delegate. */
export const PERIMETER_APPS = [
  "chat-core",
  "code",
  "computer",
  "creative",
  "founder",
  "infrastructure",
  "platform-core",
  "voice",
  "web",
] as const;

export type PerimeterAppName = (typeof PERIMETER_APPS)[number];

/**
 * Per-app sensitive-prefix ownership (S §3 item 4). The union of every app's
 * list must equal SENSITIVE_API_PREFIXES — no prefix lost. Ownership follows
 * the Job 1 foundation mapping: /api/coding → CODE; agent/sentinel/cortex →
 * PLATFORM_CORE; /api/gateway/* → INFRASTRUCTURE; /api/retrieval → CHAT_CORE
 * (primary RAG consumer; shared-service contract stays in packages).
 */
export const PER_APP_SENSITIVE_PREFIXES: Record<PerimeterAppName, ReadonlyArray<string>> = {
  "chat-core": ["/api/retrieval"],
  code: ["/api/coding"],
  computer: [],
  creative: [],
  founder: [],
  infrastructure: ["/api/gateway/logs", "/api/gateway/usage", "/api/gateway/keys"],
  "platform-core": ["/api/agent-sessions", "/api/agents", "/api/sentinel", "/api/cortex/ultra-benchmark"],
  voice: [],
  web: [],
};

export type PerimeterReason =
  | "dev-route"
  | "sensitive-api:defer-to-host-auth"
  | "internal-route:defer-to-host-auth"
  | "public";

export interface PerimeterDecision {
  allowed: boolean;
  reason: PerimeterReason;
  app: PerimeterAppName;
}

/**
 * Mechanical per-frontend delegate (S §3 item 3 wiring).
 *
 * While the monolith is retained the root proxy stays authoritative for
 * authentication; the delegate enforces only the host-independent deny
 * (dev review routes outside development) and reports which shared gate
 * matched so the host app applies its own auth layer after a real split.
 * Enforcement migrates with the routes in later units — not here.
 */
export function evaluateAppPerimeter(
  pathname: string,
  app: PerimeterAppName,
  options?: { nodeEnv?: string },
): PerimeterDecision {
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV;
  if (isDevRoute(pathname) && nodeEnv === "production") {
    return { allowed: false, reason: "dev-route", app };
  }
  if (isSensitiveApiRoute(pathname)) {
    return { allowed: true, reason: "sensitive-api:defer-to-host-auth", app };
  }
  if (isInternalRoute(pathname)) {
    return { allowed: true, reason: "internal-route:defer-to-host-auth", app };
  }
  return { allowed: true, reason: "public", app };
}

/**
 * Union gate (S §3 item 4): the union of every app's sensitive-prefix list
 * must equal the canonical SENSITIVE_API_PREFIXES. Throws on any omission
 * or unknown prefix. Pure so tests can also prove a tampered map fails.
 */
export function assertSensitivePrefixUnion(
  perApp: Record<string, ReadonlyArray<string>> = PER_APP_SENSITIVE_PREFIXES,
): void {
  const union = new Set<string>();
  for (const list of Object.values(perApp)) for (const p of list) union.add(p);
  const missing = SENSITIVE_API_PREFIXES.filter((p) => !union.has(p));
  const unknown = [...union].filter((p) => !SENSITIVE_API_PREFIXES.includes(p));
  if (missing.length || unknown.length) {
    throw new Error(
      `sensitive-prefix union mismatch: missing=[${missing.join(", ")}] unknown=[${unknown.join(", ")}]`,
    );
  }
}
