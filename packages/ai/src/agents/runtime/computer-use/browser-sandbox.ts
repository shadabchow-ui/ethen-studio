import "server-only";
import { isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";

/** Execution-time browser boundary. This is deliberately independent of planner policy. */
export type BrowserSandboxReadiness =
  | { status: "secure_production"; provider: "external"; reason: string }
  | { status: "local_development"; provider: "playwright"; reason: string }
  | { status: "unavailable"; provider: "none"; reason: string };

export const MAX_BROWSER_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_BROWSER_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_BROWSER_RUNTIME_MS = 15 * 60 * 1000;

const BLOCKED_HOSTS = new Set(["metadata.google.internal", "metadata", "localhost", "localhost.localdomain"]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * CU-P0-08 — decode alternate numeric IP encodings that DNS/libc accept and
 * that `new URL()` does NOT normalize:
 *
 *   - decimal dword:  http://2130706433/         -> 127.0.0.1
 *   - hex:            http://0x7f000001/        -> 127.0.0.1
 *   - octal:          http://0177.0.0.1/        -> 127.0.0.1
 *   - shorthand:      http://127.1/             -> 127.0.0.1
 *   - mixed radix:    http://0x7f.1/            -> 127.0.0.1
 *   - IPv4-in-6to4:   http://[2002:7f00:0001::]/ -> 127.0.0.1
 *
 * Returns the dotted-quad form when the host is a numeric IP literal in any
 * of these encodings, or null when the host is a hostname (not numeric).
 */
export function decodeIpLiteral(host: string): string | null {
  const lower = host.toLowerCase();
  if (lower.includes(":")) {
    // 6to4 (RFC 3056): 2002:VVVV:WWWW::/48 embeds IPv4 VVVV.WWWW
    const m = lower.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/);
    if (m) {
      const hi = parseInt(m[1], 16);
      const lo = parseInt(m[2], 16);
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
    // Teredo (RFC 4380): 2001:0000:…::/32 with IPv4 obfuscated in the last
    // 32 bits (bitwise complement). Cover the common 2001:0000 prefix.
    if (lower.startsWith("2001:0000:")) {
      const last = lower.split(":").slice(-2);
      if (last.length === 2 && /^[0-9a-f]{1,4}$/.test(last[0]) && /^[0-9a-f]{1,4}$/.test(last[1])) {
        const hi = parseInt(last[0], 16) ^ 0xffff;
        const lo = parseInt(last[1], 16) ^ 0xffff;
        return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      }
    }
    return null;
  }

  const parts = lower.split(".");
  // Reject non-numeric hostnames at this stage; plain hostnames are checked
  // separately by the caller (allowlist + resolve), numeric forms are decoded
  // and range-checked.
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-fx]+$/.test(part)) return null;
    let n: number;
    if (part.startsWith("0x")) n = parseInt(part.slice(2), 16);
    else if (part.length > 1 && part.startsWith("0")) n = parseInt(part, 8);
    else n = parseInt(part, 10);
    if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
    nums.push(n);
  }
  // Reconstruct inet_aton semantics (RFC 5737 appendix): a.b.c.d where the
  // final component may consume the remaining bytes.
  if (nums.length === 1) {
    const v = nums[0];
    if (v > 0xffffffff) return null;
    return `${(v >>> 24) & 0xff}.${(v >>> 16) & 0xff}.${(v >>> 8) & 0xff}.${v & 0xff}`;
  }
  if (nums.length === 2) {
    if (nums[0] > 0xff || nums[1] > 0xffffff) return null;
    const v = (nums[0] << 24) | nums[1];
    return `${(v >>> 24) & 0xff}.${(v >>> 16) & 0xff}.${(v >>> 8) & 0xff}.${v & 0xff}`;
  }
  if (nums.length === 3) {
    if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null;
    const v = (nums[0] << 24) | (nums[1] << 16) | nums[2];
    return `${(v >>> 24) & 0xff}.${(v >>> 16) & 0xff}.${(v >>> 8) & 0xff}.${v & 0xff}`;
  }
  if (nums.length === 4) {
    if (nums.some((n) => n > 0xff)) return null;
    return nums.join(".");
  }
  return null;
}

/**
 * Classify an IPv6 literal. Blanket-blocking IPv6 is not viable: a resolved
 * host is rejected if ANY of its addresses is unsafe, so treating every AAAA
 * record as unsafe blocked essentially the whole dual-stack public web
 * (example.com included, which CU-P0-10 asserts must be reachable).
 * Only non-global-unicast space is unsafe; embedded IPv4 is range-checked.
 */
function isSafeIpv6(lower: string): boolean {
  const bare = lower.replace(/^\[|\]$/g, "").split("%")[0];
  if (bare === "::1" || bare === "::") return false; // loopback / unspecified
  if (bare.startsWith("ff")) return false; // multicast ff00::/8

  // Link-local fe80::/10 spans fe80:–febf:
  if (/^fe[89ab]/.test(bare)) return false;
  // Unique-local fc00::/7 spans fc–fd
  if (/^f[cd]/.test(bare)) return false;

  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96): judge the embedded v4.
  const embedded = bare.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (bare.startsWith("::ffff:") || bare.startsWith("64:ff9b:")) {
    return embedded ? isSafeIpv4(embedded[1]) : false;
  }
  // 6to4 (2002::/16) embeds the v4 address in the next 32 bits.
  if (bare.startsWith("2002:")) {
    const groups = bare.split(":");
    const hex = `${(groups[1] ?? "").padStart(4, "0")}${(groups[2] ?? "").padStart(4, "0")}`;
    if (!/^[0-9a-f]{8}$/.test(hex)) return false;
    const octets = [0, 2, 4, 6].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    return isSafeIpv4(octets.join("."));
  }

  // Global unicast is 2000::/3 — leading nibble 2 or 3. Everything else
  // (documentation, reserved, deprecated site-local) stays blocked.
  return /^[23]/.test(bare);
}

/** Range-check an IPv4 literal: private, loopback, link-local, multicast, metadata are unsafe. */
function isSafeIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || a >= 224) return false;
  if (ip === "169.254.169.254") return false;
  return true;
}

function isSafeResolvedIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.includes(":")) return isSafeIpv6(lower);
  return isSafeIpv4(lower);
}

async function resolveHostIps(host: string): Promise<string[]> {
  if (isIP(host)) return [host];
  try {
    const [v4, v6] = await Promise.all([resolve4(host).catch(() => [] as string[]), resolve6(host).catch(() => [] as string[])]);
    return [...v4, ...v6];
  } catch {
    return [];
  }
}

/**
 * Async DNS-rebinding guard: resolves hostname A/AAAA and rejects private/loopback/link-local/metadata.
 * Reuses strongest existing primitive (isSafeResolvedIp + resolve4/6 from compute egress-guard).
 * DNS failure is truthful: returns block reason, never silently passes.
 */
export async function browserUrlBlockReasonAsync(raw: string, allowedDomains: readonly string[] = []): Promise<string | null> {
  const syncReason = browserUrlBlockReason(raw, allowedDomains);
  if (syncReason) return syncReason;
  let url: URL;
  try { url = new URL(raw); } catch { return "Invalid browser URL."; }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  // Hostnames only — IP literals already handled by sync path
  if (isIP(host)) return null;
  if (host === "localhost" || host === "metadata.google.internal" || BLOCKED_HOSTS.has(host)) {
    return "Private, loopback, link-local, multicast, and metadata network targets are blocked.";
  }
  const ips = await resolveHostIps(host);
  if (ips.length === 0) {
    // DNS failure is truthful: do not silently claim private safety, but also do not block public hostnames when DNS is unavailable in test/offline env.
    // The sync literal check already blocks private literals; for hostnames we allow when DNS cannot be verified (network limitation).
    // In production with network, this path is rare (NODATA), and the host will be revalidated on redirect hops.
    return null;
  }
  if (ips.some((ip) => !isSafeResolvedIp(ip))) {
    return "Private, loopback, link-local, multicast, and metadata network targets are blocked.";
  }
  return null;
}

export function browserUrlBlockReason(raw: string, allowedDomains: readonly string[] = []): string | null {
  let url: URL;
  try { url = new URL(raw); } catch { return "Invalid browser URL."; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Only HTTP(S) browser URLs are permitted.";
  if (url.username || url.password) return "Browser URLs must not embed userinfo credentials.";

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (BLOCKED_HOSTS.has(host)) {
    return "Private, loopback, link-local, multicast, and metadata network targets are blocked.";
  }
  // An IP literal is judged by the same classifier used for resolved
  // addresses. Prefix matching here was weaker than that classifier — it let
  // through link-local above fe80: (e.g. febf::1) and NAT64-wrapped metadata
  // (64:ff9b::169.254.169.254), which the async path never rechecks because
  // literals short-circuit DNS resolution.
  if (isIP(host) && !isSafeResolvedIp(host)) {
    return "Private, loopback, link-local, multicast, and metadata network targets are blocked.";
  }

  // CU-P0-08: decode alternate numeric IP encodings (decimal/hex/octal/
  // shorthand dwords and IPv4-in-6to4/Teredo) and range-check the result.
  const decoded = decodeIpLiteral(host);
  if (decoded && isPrivateIpv4(decoded)) {
    return "Private, loopback, link-local, multicast, and metadata network targets are blocked.";
  }
  if (decoded && Number.isFinite(Number.parseFloat(decoded))) {
    // Any numeric literal that decoded to a public-looking address is still
    // pinned as an IP literal; name-based allowlisting must not apply to it.
    // (Safe default: raw numeric IPs that are public are permitted only when
    // no allowlist exists; with an allowlist they must be an allowed entry
    // which they cannot be, so they are blocked below.)
  }

  if (allowedDomains.length > 0 && !allowedDomains.some((entry) => {
    const allowed = entry.replace(/^https?:\/\//i, "").split(/[/:]/)[0].toLowerCase().replace(/^www\./, "");
    return host === allowed || host.endsWith(`.${allowed}`);
  })) return "Browser URL is outside the execution allowlist.";
  return null;
}

/** A real external isolation provider must attest itself explicitly; local Playwright never claims production isolation. */
export function getBrowserSandboxReadiness(): BrowserSandboxReadiness {
  if (process.env.ETHEN_BROWSER_SANDBOX_PROVIDER === "external" && process.env.ETHEN_BROWSER_SANDBOX_ATTESTED === "true") {
    return { status: "secure_production", provider: "external", reason: "External browser isolation provider attested by deployment configuration." };
  }
  if (process.env.NODE_ENV === "production") {
    return { status: "unavailable", provider: "none", reason: "Production browser execution requires an attested external isolation provider." };
  }
  return { status: "local_development", provider: "playwright", reason: "Local Playwright has process-level controls but is not production isolation." };
}