/**
 * Studio V3 Job 3 — reference asset resolution (SSRF-safe, tenant-scoped).
 *
 * Reference inputs arrive either as tenant asset ids (resolved to fresh
 * provider-fetchable URLs at worker time) or as remote URLs (validated at
 * command time AND worker time, passed through for the provider to fetch).
 * Cross-tenant and cross-project references are refused; credentials in
 * URLs, private/link-local targets and metadata endpoints are refused.
 * Reference identities are deterministic hashes of the canonical locator.
 */

import { createHash } from "node:crypto";

export interface ReferenceValidation {
  ok: boolean;
  /** Canonical locator (asset:uuid or normalized https URL). */
  canonical: string | null;
  /** Deterministic reference id (sha256 of canonical, hex prefix). */
  refId: string | null;
  error: string | null;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "169.254.169.254",
  "fd00:ec2::254",
]);

function isPrivateLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host === "::1" || host === "0.0.0.0") return true;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }
  if (host.includes(":")) {
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return true;
  return false;
}

function canonicalizeRemoteUrl(raw: string): { canonical: string } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "reference URL is not a valid URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: `reference URL scheme ${url.protocol} is not allowed (https only in practice)` };
  }
  if (url.protocol !== "https:") {
    return { error: "reference URLs must use https" };
  }
  if (url.username || url.password) {
    return { error: "reference URLs must not carry credentials" };
  }
  if (isPrivateLiteral(url.hostname)) {
    return { error: `reference host ${url.hostname} is not a public endpoint` };
  }
  url.hash = "";
  return { canonical: url.toString() };
}

export function validateReferenceLocator(input: {
  assetId?: string;
  url?: string;
}): ReferenceValidation {
  const fail = (error: string): ReferenceValidation => ({ ok: false, canonical: null, refId: null, error });
  const assetId = input.assetId?.trim() ?? "";
  const url = input.url?.trim() ?? "";
  if (assetId && url) return fail("provide either a tenant asset id or a remote URL, not both");
  if (assetId) {
    if (!/^[0-9a-fA-F-]{8,64}$/.test(assetId)) return fail("tenant asset id is malformed");
    const canonical = `asset:${assetId.toLowerCase()}`;
    return { ok: true, canonical, refId: refIdFor(canonical), error: null };
  }
  if (url) {
    if (url.length > 2048) return fail("reference URL exceeds 2048 characters");
    const parsed = canonicalizeRemoteUrl(url);
    if ("error" in parsed) return fail(parsed.error);
    return { ok: true, canonical: parsed.canonical, refId: refIdFor(parsed.canonical), error: null };
  }
  return fail("a reference asset id or remote URL is required");
}

export function refIdFor(canonical: string): string {
  return createHash("sha256").update(`studio-ref:v1:${canonical}`, "utf8").digest("hex").slice(0, 32);
}

/** Ownership proof for tenant asset references (worker + command share it). */
export function assertTenantOwnership(input: {
  record: { source: string; projectId: string } | null;
  projectId: string;
}): void {
  if (!input.record) throw new Error("REFERENCE_NOT_FOUND: reference asset does not exist.");
  if (input.record.source !== "studio") {
    throw new Error("REFERENCE_FORBIDDEN: reference asset is not an owned studio object.");
  }
  if (input.record.projectId !== input.projectId) {
    throw new Error("REFERENCE_FORBIDDEN: reference asset belongs to a different project.");
  }
}
