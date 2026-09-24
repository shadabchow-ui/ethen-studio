import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function hashGatewayApiKey(rawKey: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = createHash("sha256").update(`${salt}:${rawKey}`, "utf8").digest("hex");
  return `sha256:${salt}:${digest}`;
}

export function verifyGatewayApiKeyHash(rawKey: string, storedHash: string): boolean {
  const [algorithm, salt, digest] = storedHash.split(":");
  if (algorithm !== "sha256" || !salt || !digest) return false;
  const candidate = createHash("sha256").update(`${salt}:${rawKey}`, "utf8").digest();
  const expected = Buffer.from(digest, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/**
 * Length of the persisted `gateway_api_keys.key_prefix` column: the
 * environment tag (`ethen_live_` / `ethen_test_`, both 11 chars) plus the
 * first 8 characters of the secret.
 *
 * Issuance and lookup MUST derive the prefix from this single constant.
 * They previously diverged — issuance stored 19 chars while the chat
 * completions route queried an 11-char slice — so no platform-issued key
 * could ever be authenticated by that route.
 */
const GATEWAY_API_KEY_ENVIRONMENT_TAG_LENGTH = 11;
export const GATEWAY_API_KEY_PREFIX_LENGTH =
  GATEWAY_API_KEY_ENVIRONMENT_TAG_LENGTH + 8;

/** The `key_prefix` value to look a raw key up by. Mirrors issuance exactly. */
export function gatewayApiKeyLookupPrefix(rawKey: string): string {
  return rawKey.slice(0, GATEWAY_API_KEY_PREFIX_LENGTH);
}

export function buildGatewayApiKey(environment: "live" | "test" = "live") {
  const prefix = environment === "test" ? "ethen_test_" : "ethen_live_";
  const secret = randomBytes(24).toString("base64url");
  const rawKey = `${prefix}${secret}`;
  return {
    rawKey,
    keyPrefix: gatewayApiKeyLookupPrefix(rawKey),
    keySuffix: rawKey.slice(-6),
  };
}
