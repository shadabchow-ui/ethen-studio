// Ethen Flows Phase 5 — SSRF Guard.
//
// Deterministic server-side SSRF protection before any network contact.
// Blocks localhost, private/internal IP ranges, cloud metadata endpoints,
// and non-http/https protocols. Requires allowedHost to match parsed host.
//
// CRITICAL: no network request is made by this module. It is a pure
// validation layer that runs before any fetch call.

import type { SSRFGuardResult } from "./ssrf-result";

const BLOCKED_HOST_PATTERNS: Array<{ pattern: string | RegExp; label: string }> = [
  { pattern: "localhost", label: "localhost" },
  { pattern: "metadata.google.internal", label: "GCP metadata endpoint" },
  { pattern: /\.local$/, label: "local TLD" },
];

const BLOCKED_IPV4_RANGES: Array<{ cidr: string; label: string }> = [
  { cidr: "127.0.0.0/8", label: "loopback" },
  { cidr: "0.0.0.0/8", label: "current network" },
  { cidr: "10.0.0.0/8", label: "private (Class A)" },
  { cidr: "172.16.0.0/12", label: "private (Class B)" },
  { cidr: "192.168.0.0/16", label: "private (Class C)" },
  { cidr: "169.254.0.0/16", label: "link-local" },
];

const BLOCKED_IPV6_ADDRESSES = new Set(["::1", "::", "fe80::"]);

const BLOCKED_PROTOCOLS = new Set(["file:", "ftp:", "gopher:", "data:", "javascript:"]);

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function ipv4ToInt(octets: number[]): number {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    octets.push(num);
  }
  return octets;
}

function isInIPv4Range(host: string, cidr: string): boolean {
  const [rangeIp, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  const rangeOctets = parseIPv4(rangeIp);
  const hostOctets = parseIPv4(host);
  if (!rangeOctets || !hostOctets) return false;

  const rangeInt = ipv4ToInt(rangeOctets);
  const hostInt = ipv4ToInt(hostOctets);
  const mask = bits === 0 ? 0 : 0xffffffff << (32 - bits);

  return (hostInt & mask) === (rangeInt & mask);
}

function isIpv6MatchingPrefix(host: string, prefix: string): boolean {
  try {
    const normalized = host.toLowerCase();
    if (prefix.endsWith("::")) {
      return normalized === prefix || normalized.startsWith(prefix.slice(0, -2) + ":");
    }
    return normalized.startsWith(prefix.toLowerCase());
  } catch {
    return false;
  }
}

const BLOCKED_METADATA_IPS = new Set(["169.254.169.254"]);

export function evaluateSSRFGuard(rawUrl: string, allowedHost: string): SSRFGuardResult {
  const riskFlags: string[] = [];
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      allowed: false,
      reason: `Invalid URL: '${rawUrl}'. URL could not be parsed.`,
      normalizedHost: rawUrl,
      riskFlags: ["invalid_url"],
    };
  }

  const protocol = parsed.protocol.toLowerCase();

  if (BLOCKED_PROTOCOLS.has(protocol)) {
    return {
      allowed: false,
      reason: `Blocked protocol '${protocol}'. Only http: and https: are allowed.`,
      normalizedHost: parsed.hostname,
      riskFlags: ["blocked_protocol", ...riskFlags],
    };
  }

  if (!ALLOWED_PROTOCOLS.has(protocol)) {
    return {
      allowed: false,
      reason: `Unsupported protocol '${protocol}'. Only http: and https: are allowed.`,
      normalizedHost: parsed.hostname,
      riskFlags: ["unsupported_protocol", ...riskFlags],
    };
  }

  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  for (const { pattern, label } of BLOCKED_HOST_PATTERNS) {
    if (typeof pattern === "string") {
      if (hostname === pattern || hostname.endsWith("." + pattern)) {
        return {
          allowed: false,
          reason: `Blocked host '${hostname}': matches ${label} pattern.`,
          normalizedHost: hostname,
          riskFlags: [label.replace(/\s/g, "_"), ...riskFlags],
        };
      }
    } else if (pattern.test(hostname)) {
      return {
        allowed: false,
        reason: `Blocked host '${hostname}': matches ${label} pattern.`,
        normalizedHost: hostname,
        riskFlags: [label.replace(/\s/g, "_"), ...riskFlags],
      };
    }
  }

  if (BLOCKED_METADATA_IPS.has(hostname)) {
    return {
      allowed: false,
      reason: `Blocked host '${hostname}': cloud metadata endpoint.`,
      normalizedHost: hostname,
      riskFlags: ["metadata_endpoint", ...riskFlags],
    };
  }

  for (const { cidr, label } of BLOCKED_IPV4_RANGES) {
    if (isInIPv4Range(hostname, cidr)) {
      return {
        allowed: false,
        reason: `Blocked host '${hostname}': matches ${label} range ${cidr}.`,
        normalizedHost: hostname,
        riskFlags: [label.replace(/[\s()]/g, "_").replace(/[()]/g, ""), ...riskFlags],
      };
    }
  }

  for (const blockedV6 of BLOCKED_IPV6_ADDRESSES) {
    if (isIpv6MatchingPrefix(hostname, blockedV6)) {
      return {
        allowed: false,
        reason: `Blocked host '${hostname}': matches IPv6 ${blockedV6}.`,
        normalizedHost: hostname,
        riskFlags: ["ipv6_blocked", ...riskFlags],
      };
    }
  }

  const normalizedAllowedHost = allowedHost.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (hostname !== normalizedAllowedHost) {
    return {
      allowed: false,
      reason: `Host mismatch: expected '${normalizedAllowedHost}' but got '${hostname}'. allowedHost must match the parsed URL hostname.`,
      normalizedHost: hostname,
      riskFlags: ["host_mismatch", ...riskFlags],
    };
  }

  if (protocol === "http:") {
    riskFlags.push("uses_http_not_https");
  }

  return {
    allowed: true,
    reason: `Host '${hostname}' passes SSRF guard with allowedHost '${allowedHost}'.`,
    normalizedHost: hostname,
    riskFlags: riskFlags.length > 0 ? riskFlags : [],
  };
}

// ── Callback/status URL validation for provider-supplied endpoints ─────────
//
// Provider responses (e.g. fal.ai queue status/result URLs) must never be
// fetched with credentials until they pass scheme/origin/host validation.
// This is the fail-closed helper used by adapter layers (STU-P0-05) before
// any credentialed fetch. It layers on top of evaluateSSRFGuard() and adds:
//   - hard scheme allowlist (http:/https: only)
//   - rejection of userinfo (user:pass@) in URLs
//   - host confinement to an explicit allowlist of provider-controlled
//     domains (exact match or a subdomain of an allowed entry)
//   - all private/loopback/link-local/metadata/IPv6 checks from the guard
//
// Callers MUST also set `redirect: "error"` on the fetch so a redirect to a
// blocked target cannot smuggle credentials to an attacker-controlled host.

export function validateCallbackUrl(
  rawUrl: string,
  allowedHosts: readonly string[],
): SSRFGuardResult {
  if (allowedHosts.length === 0) {
    return {
      allowed: false,
      reason: "No allowed callback hosts configured; refusing provider-supplied URL.",
      normalizedHost: rawUrl,
      riskFlags: ["no_allowed_hosts"],
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      allowed: false,
      reason: `Invalid URL: '${rawUrl}'. URL could not be parsed.`,
      normalizedHost: rawUrl,
      riskFlags: ["invalid_url"],
    };
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return {
      allowed: false,
      reason: `Blocked protocol '${protocol}'. Only http: and https: are allowed for provider callback URLs.`,
      normalizedHost: parsed.hostname,
      riskFlags: ["blocked_protocol"],
    };
  }

  if (parsed.username || parsed.password) {
    return {
      allowed: false,
      reason: "Provider callback URLs must not embed userinfo credentials.",
      normalizedHost: parsed.hostname,
      riskFlags: ["userinfo_present"],
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const allowed = allowedHosts.some((entry) => {
    const normalizedEntry = entry.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
    return hostname === normalizedEntry || hostname.endsWith("." + normalizedEntry);
  });
  if (!allowed) {
    return {
      allowed: false,
      reason: `Host '${hostname}' is not an allowed provider callback host.`,
      normalizedHost: hostname,
      riskFlags: ["host_not_allowed"],
    };
  }

  // Layer the full SSRF guard on top (private IPs, loopback, metadata,
  // IPv6, non-http protocols) with the validated host pinned.
  return evaluateSSRFGuard(rawUrl, hostname);
}
