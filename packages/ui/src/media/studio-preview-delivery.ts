/**
 * Studio V2 Job 12 (P0-6) — preview / delivery contract.
 *
 * Explicit semantics for SOURCE | PREVIEW | REVIEW | DELIVERY. A provider
 * `previewUrl` is never treated as a universal player contract, and no
 * permanent-public URL is ever inferred from a temporary preview URL.
 */

export type StudioMediaAccess = "source" | "preview" | "review" | "delivery";

export interface StudioMediaLocator {
  access: StudioMediaAccess;
  /** Authorization-bound source key or signed URL, depending on access. */
  url: string | null;
  /** Owner project scope; required for source/preview/download. */
  projectId: string | null;
  /** ISO expiry for signed previews, review links, and deliveries. */
  expiresAt: string | null;
  /** Content hash when pinned (exports/deliveries). */
  contentHash?: string | null;
  /** True when the locator came from an explicit download/export action. */
  explicitDownload?: boolean;
}

export interface PreviewDeliveryIssue {
  code:
    | "SOURCE_NOT_AUTHORIZED"
    | "PREVIEW_EXPIRED"
    | "REVIEW_EXPIRED"
    | "DELIVERY_NOT_PINNED"
    | "PUBLIC_URL_INFERRED"
    | "DOWNLOAD_NOT_EXPLICIT";
  message: string;
}

function expired(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return true;
  const parsed = Date.parse(expiresAt);
  return !Number.isFinite(parsed) || parsed <= now;
}

/**
 * Validate a media locator for shell rendering. Returns issues; an empty
 * array means the locator may be rendered for its declared access kind.
 * Pure and side-effect free.
 */
export function validateStudioMediaLocator(
  locator: StudioMediaLocator,
  options?: { now?: number },
): PreviewDeliveryIssue[] {
  const issues: PreviewDeliveryIssue[] = [];
  const now = options?.now ?? Date.now();
  if (!locator.url) {
    issues.push({ code: "SOURCE_NOT_AUTHORIZED", message: "No media URL is available for this access kind." });
    return issues;
  }
  switch (locator.access) {
    case "source":
      if (!locator.projectId) {
        issues.push({ code: "SOURCE_NOT_AUTHORIZED", message: "Source access requires project scope." });
      }
      break;
    case "preview":
      if (expired(locator.expiresAt, now)) {
        issues.push({ code: "PREVIEW_EXPIRED", message: "Signed preview expired; request a fresh preview." });
      }
      if (!locator.projectId) {
        issues.push({ code: "SOURCE_NOT_AUTHORIZED", message: "Preview access requires project scope." });
      }
      break;
    case "review":
      if (expired(locator.expiresAt, now)) {
        issues.push({ code: "REVIEW_EXPIRED", message: "Review link expired or revoked; request a new review link." });
      }
      break;
    case "delivery":
      if (!locator.contentHash || !/^[0-9a-f]{64}$/i.test(locator.contentHash)) {
        issues.push({ code: "DELIVERY_NOT_PINNED", message: "Delivery requires a pinned sha256 content hash." });
      }
      if (!locator.explicitDownload) {
        issues.push({ code: "DOWNLOAD_NOT_EXPLICIT", message: "Downloads and exports must come from an explicit action." });
      }
      break;
  }
  return issues;
}

/**
 * Guard: a temporary preview/review URL must never be persisted or shared as
 * a permanent public URL. Returns an issue when the candidate looks like a
 * signed/transient URL being promoted beyond its access kind.
 */
export function assertNoPermanentPublicUrl(candidate: string): PreviewDeliveryIssue[] {
  if (/[?&](sig(nature)?|token|expires|se)=/i.test(candidate) || candidate.includes("signed")) {
    return [{
      code: "PUBLIC_URL_INFERRED",
      message: "Signed/transient URLs must not be stored or shared as permanent public URLs.",
    }];
  }
  return [];
}

/** Display label for the four access kinds (no URLs, no secrets). */
export function studioMediaAccessLabel(access: StudioMediaAccess): string {
  switch (access) {
    case "source": return "Source (authorized)";
    case "preview": return "Signed preview";
    case "review": return "Review link";
    case "delivery": return "Export delivery";
  }
}
