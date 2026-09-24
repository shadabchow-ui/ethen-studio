/**
 * Canonical access / lifecycle presentation catalog.
 *
 * Used by the edge proxy (browser HTML denials) and in-app V2 surfaces.
 * Does not grant access and does not rewrite HTTP/API outcomes.
 */

export type AccessStateKind =
  | "authentication_required"
  | "enrollment_required"
  | "private_alpha"
  | "product_unavailable"
  | "product_frozen"
  | "setup_required"
  | "capability_disabled"
  | "access_denied"
  | "offline"
  | "read_only";

/**
 * D15-J02 — blocked-route state for F-01's approved study. Carried as a
 * mapping onto `capability_disabled` (not a new kind) so existing V2
 * renderers keep handling it with no changes. The copy is verbatim and
 * must not be paraphrased.
 */
export const BLOCKED_ROUTE_CODE = "BLOCKED_ROUTE";

export const BLOCKED_ROUTE_COPY =
  "Nothing was started. Your task and selected context are unchanged.";

export interface AccessStateInput {
  code: string;
  status: number;
  error?: string;
  productId?: string | null;
  title?: string;
}

export interface AccessStateAction {
  href: string;
  label: string;
}

export interface AccessStatePresentation {
  kind: AccessStateKind;
  code: string;
  status: number;
  productId: string | null;
  productLabel: string | null;
  title: string;
  description: string;
  httpLabel: string;
  primaryAction: AccessStateAction;
  secondaryAction?: AccessStateAction;
}

const PRODUCT_LABELS: Readonly<Record<string, string>> = {
  voice: "Voice",
  automation: "Flow",
  studio: "Studio",
  security: "Sentinel",
  sentinel: "Sentinel",
  designer: "Designer",
  founder: "Founder",
  "computer-use": "Computer",
  code: "Code",
  research: "Research",
  gateway: "Gateway",
  model: "Ethen",
  cortex: "Ethen",
  "local-models": "Local Models",
  compute: "Compute",
  "model-intelligence": "Model Intelligence",
};

export function accessStateProductLabel(productId: string | null | undefined): string | null {
  if (!productId) return null;
  return PRODUCT_LABELS[productId] ?? productId.replace(/[-_]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function kindFromCode(code: string, status: number, error?: string): AccessStateKind {
  switch (code) {
    case "AUTHENTICATION_REQUIRED":
      return "authentication_required";
    case "ENROLLMENT_REQUIRED":
      return error?.toLowerCase().includes("private alpha") ? "private_alpha" : "enrollment_required";
    case "PROJECT_MEMBERSHIP_REQUIRED":
      return "access_denied";
    case "PRODUCT_FROZEN":
      return "product_frozen";
    case "PRODUCT_UNAVAILABLE":
    case "FIXTURE_SURFACE_HIDDEN":
      return "product_unavailable";
    case "STUDIO_NOT_READY":
    case "AUTH_NOT_CONFIGURED":
      return "setup_required";
    case "STUDIO_DISABLED":
    case "KILL_SWITCH":
    case BLOCKED_ROUTE_CODE:
      return "capability_disabled";
    case "OFFLINE":
      return "offline";
    case "READ_ONLY":
      return "read_only";
    default:
      break;
  }
  if (status === 401) return "authentication_required";
  if (status === 403) return "access_denied";
  if (status === 404) return "product_unavailable";
  if (status === 503) return "capability_disabled";
  return "access_denied";
}

function defaultTitle(kind: AccessStateKind, productLabel: string | null): string {
  const name = productLabel ?? "This product";
  switch (kind) {
    case "authentication_required":
      return "Sign in required";
    case "enrollment_required":
      return `${name} requires enrollment`;
    case "private_alpha":
      return `${name} is in private alpha`;
    case "product_unavailable":
      return `${name} is unavailable`;
    case "product_frozen":
      return `${name} is unavailable`;
    case "setup_required":
      return `${name} is not ready`;
    case "capability_disabled":
      return `${name} is disabled`;
    case "offline":
      return `${name} is offline`;
    case "read_only":
      return `${name} is read-only`;
    case "access_denied":
      return "Access denied";
  }
}

function defaultDescription(kind: AccessStateKind, productLabel: string | null, error?: string): string {
  if (error?.trim()) return error.trim();
  const name = productLabel ?? "This product";
  switch (kind) {
    case "authentication_required":
      return `${name} requires an authenticated session. Sign in, then try again.`;
    case "enrollment_required":
      return `${name} is limited to enrolled workspaces. Request access from your account team.`;
    case "private_alpha":
      return `${name} is in private alpha and is not generally available.`;
    case "product_unavailable":
      return `${name} is not available in this deployment.`;
    case "product_frozen":
      return `${name} is frozen until its completion milestone. Existing data is not deleted.`;
    case "setup_required":
      return `${name} still needs required environment setup before it can run.`;
    case "capability_disabled":
      return `${name} is currently disabled by a capability or kill switch.`;
    case "offline":
      return `${name} is offline. Showing the last synced content; changes are paused until the connection returns.`;
    case "read_only":
      return `${name} is read-only in this workspace. You can view, but not change, anything here.`;
    case "access_denied":
      return "You do not have permission to open this surface.";
  }
}

function actionsFor(kind: AccessStateKind): {
  primaryAction: AccessStateAction;
  secondaryAction?: AccessStateAction;
} {
  if (kind === "authentication_required") {
    return {
      primaryAction: { href: "/sign-in", label: "Sign in" },
      secondaryAction: { href: "/", label: "Back to home" },
    };
  }
  return {
    primaryAction: { href: "/", label: "Back to home" },
  };
}

export function resolveAccessState(input: AccessStateInput): AccessStatePresentation {
  const productId = input.productId ?? null;
  const productLabel = accessStateProductLabel(productId);
  const kind = kindFromCode(input.code, input.status, input.error);
  const title = input.title?.trim() || defaultTitle(kind, productLabel);
  const description =
    input.code === BLOCKED_ROUTE_CODE
      ? BLOCKED_ROUTE_COPY
      : defaultDescription(kind, productLabel, input.error);
  return {
    kind,
    code: input.code,
    status: input.status,
    productId,
    productLabel,
    title,
    description,
    httpLabel: `${input.status}`,
    ...actionsFor(kind),
  };
}

export function wantsBrowserDocument(pathname: string, acceptHeader: string | null): boolean {
  if (pathname.startsWith("/api/")) return false;
  return (acceptHeader ?? "").includes("text/html");
}
