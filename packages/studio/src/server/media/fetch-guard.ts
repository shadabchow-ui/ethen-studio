/** Studio V5 media — SSRF-safe fetch guard (STUDIO_07, server-only). */
import "server-only";
import { mediaError, MediaError } from "./types";

/** Redirect hops followed before the fetch is rejected as a redirect loop/abuse. */
export const MEDIA_FETCH_MAX_REDIRECTS = 3;
/** Hard cap on a single fetched response body. Kind-specific caps live in probe.ts. */
export const MEDIA_FETCH_MAX_BYTES = 2 * 1024 * 1024 * 1024;

function isIPv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function ipv4Bytes(host: string): [number, number, number, number] | null {
  if (!isIPv4Literal(host)) return null;
  const parts = host.split(".").map(Number);
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return parts as [number, number, number, number];
}

/** True when a numeric IPv4 address is private, loopback, link-local or reserved. */
export function isBlockedIPv4(host: string): boolean {
  const bytes = ipv4Bytes(host);
  if (!bytes) return false;
  const [a, b] = bytes;
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 0) return true; // current network
  if (a >= 224) return true; // multicast + reserved
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && (b === 0 || b === 18 || b === 19)) return true; // reserved/test-net blurbs
  return false;
}

/** True when an IPv6 literal (without brackets) is loopback, link-local, unique-local or mapped-private. */
export function isBlockedIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80:") || h.startsWith("fe80::")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
  if (h === "::ffff:0:0" || h.startsWith("::ffff:")) {
    // IPv4-mapped: apply the IPv4 rules to the embedded address.
    const tail = h.slice("::ffff:".length);
    if (isIPv4Literal(tail)) return isBlockedIPv4(tail);
    const embedded = tail.split(":").pop() ?? "";
    if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(tail)) {
      const [hi, lo] = tail.split(":").map((x) => parseInt(x, 16));
      const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      void embedded;
      return isBlockedIPv4(dotted);
    }
    return true;
  }
  if (h.startsWith("ff")) return true; // multicast
  return false;
}

/**
 * Assert that a DNS-resolved address is a safe fetch target. The worker
 * resolves the hostname, then re-checks every returned A/AAAA record here
 * before connecting — this closes the DNS-rebinding leg that literal-only
 * checks cannot see.
 */
export function assertSafeResolvedAddress(ip: string): void {
  const trimmed = ip.trim().replace(/^\[|\]$/g, "");
  if (isIPv4Literal(trimmed) || /^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    if (isBlockedIPv4(trimmed)) {
      throw mediaError("FORBIDDEN", "Resolved address is not a permitted fetch target.", { ip: trimmed });
    }
    return;
  }
  if (trimmed.includes(":")) {
    if (isBlockedIPv6(trimmed)) {
      throw mediaError("FORBIDDEN", "Resolved address is not a permitted fetch target.", { ip: trimmed });
    }
    return;
  }
  throw mediaError("BAD_REQUEST", "Resolved address is not a valid IP literal.", {});
}

function blockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (isIPv4Literal(h)) return isBlockedIPv4(h);
  if (h.includes(":")) return isBlockedIPv6(h.replace(/^\[|\]$/g, ""));
  return false;
}

/** True for loopback hosts only (127/8, ::1, localhost). Fixture bypass scope. */
function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost") return true;
  if (h === "::1") return true;
  const bytes = ipv4Bytes(h);
  return bytes !== null && bytes[0] === 127;
}

/**
 * Validate one fetch URL before any connection is opened. Rejects non-https
 * provider URLs, credentials in the URL, blocked hosts, and non-default
 * port probing outside http(s). Throws MediaError(SSRF_BLOCKED shape).
 *
 * `allowInsecureLoopback` (fixture/dev only, refused in production)
 * admits http(s) loopback URLs so the fixture lane can ingest its own
 * loopback doubles through the real pipeline; anything non-loopback is
 * still rejected.
 */
export function assertSafeFetchUrl(candidate: string, opts?: { allowInsecureLoopback?: boolean }): URL {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw mediaError("BAD_REQUEST", "Source URL is not a valid absolute URL.", {});
  }
  if (opts?.allowInsecureLoopback) {
    if (process.env.NODE_ENV === "production") {
      throw mediaError("FORBIDDEN", "Insecure loopback fetch is refused in production.", {});
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw mediaError("FORBIDDEN", "Loopback source URLs must use http(s).", { protocol: parsed.protocol });
    }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      throw mediaError("FORBIDDEN", "Source URLs must not embed credentials.", {});
    }
    if (!isLoopbackHost(parsed.hostname)) {
      throw mediaError("FORBIDDEN", "Only loopback hosts bypass the https guard.", {
        host: parsed.hostname,
        reason: "SSRF_BLOCKED",
      });
    }
    return parsed;
  }
  if (parsed.protocol !== "https:") {
    throw mediaError("FORBIDDEN", "Source URLs must use https.", { protocol: parsed.protocol });
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw mediaError("FORBIDDEN", "Source URLs must not embed credentials.", {});
  }
  if (blockedHostname(parsed.hostname)) {
    throw mediaError("FORBIDDEN", "Source host is not a permitted fetch target.", {
      host: parsed.hostname,
      reason: "SSRF_BLOCKED",
    });
  }
  return parsed;
}

/** Single HTTP exchange as seen by the guard (redirects are NOT auto-followed). */
export interface FetchOnceResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
}

export interface FetchOncePort {
  fetchOnce(url: string, opts: { timeoutMs: number; maxBytes: number }): Promise<FetchOnceResponse>;
}

function header(headers: Readonly<Record<string, string>>, name: string): string | null {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return null;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * Fetch a provider URL with per-hop SSRF validation. Every redirect target
 * is re-validated before it is followed; a redirect to a private address,
 * localhost, or non-https URL aborts with SSRF_BLOCKED and no body is read
 * from the blocked hop.
 */
export async function fetchWithGuard(
  port: FetchOncePort,
  sourceUrl: string,
  opts?: { timeoutMs?: number; maxBytes?: number; allowInsecureLoopback?: boolean },
): Promise<{ body: Uint8Array; finalUrl: string; hops: number; contentType: string | null }> {
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const maxBytes = opts?.maxBytes ?? MEDIA_FETCH_MAX_BYTES;
  const guardOpts = opts?.allowInsecureLoopback ? { allowInsecureLoopback: true as const } : undefined;
  let current = assertSafeFetchUrl(sourceUrl, guardOpts).toString();
  let hops = 0;
  for (;;) {
    const response = await port.fetchOnce(current, { timeoutMs, maxBytes });
    if (isRedirect(response.status)) {
      const location = header(response.headers, "location");
      if (!location) {
        throw mediaError("PROVIDER_ERROR", "Provider redirect is missing a Location header.", { url: current });
      }
      hops += 1;
      if (hops > MEDIA_FETCH_MAX_REDIRECTS) {
        throw mediaError("PROVIDER_ERROR", "Provider redirect chain exceeds the hop limit.", {
          hops,
          limit: MEDIA_FETCH_MAX_REDIRECTS,
        });
      }
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        throw mediaError("PROVIDER_ERROR", "Provider redirect target is not a valid URL.", { location });
      }
      // Re-validate BEFORE following: a redirect to a private address dies here.
      try {
        current = assertSafeFetchUrl(next, guardOpts).toString();
      } catch (error) {
        if (error instanceof MediaError) {
          throw mediaError("FORBIDDEN", "Provider redirect target is not a permitted fetch target.", {
            ...error.details,
            hop: hops,
            reason: "SSRF_BLOCKED",
          });
        }
        throw error;
      }
      continue;
    }
    if (response.status === 403 || response.status === 410) {
      throw mediaError("QUOTE_EXPIRED", "Provider URL expired or was revoked; re-request the output.", {
        status: response.status,
        reason: "EXPIRED_SOURCE",
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw mediaError("PROVIDER_ERROR", `Provider fetch failed with status ${response.status}.`, {
        status: response.status,
      }, response.status >= 500);
    }
    if (response.body.byteLength > maxBytes) {
      throw mediaError("BAD_REQUEST", "Fetched bytes exceed the ingest limit.", {
        byteSize: response.body.byteLength,
        maxBytes,
        reason: "OVERSIZED",
      });
    }
    return { body: response.body, finalUrl: current, hops, contentType: header(response.headers, "content-type") };
  }
}
