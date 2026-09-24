import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { getServerEnv } from "@ethen/config/env";
import { redactSummary } from "@ethen/security/redact";

const ENCRYPTION_KEY_ENV = "GATEWAY_ENCRYPTION_KEY";
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const VERSION_PREFIX = "ev1:";

function deriveKey(rawKey: string, salt: Buffer): Buffer {
  return scryptSync(rawKey, salt, KEY_LENGTH);
}

function getEncryptionKey(): Buffer | null {
  const raw = getServerEnv(ENCRYPTION_KEY_ENV);
  if (!raw || raw.length < 32) return null;
  const salt = Buffer.alloc(SALT_LENGTH, 0);
  return deriveKey(raw, salt);
}

export function isEncryptionAvailable(): boolean {
  return getEncryptionKey() !== null;
}

export function encrypt(text: string): string | null {
  const key = getEncryptionKey();
  if (!key) return null;

  try {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return `${VERSION_PREFIX}${combined.toString("base64url")}`;
  } catch {
    return null;
  }
}

export function decrypt(encrypted: string): string | null {
  const key = getEncryptionKey();
  if (!key) return null;

  if (!encrypted.startsWith(VERSION_PREFIX)) return null;

  try {
    const combined = Buffer.from(encrypted.slice(VERSION_PREFIX.length), "base64url");
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function computeKeyPrefix(rawKey: string): string {
  if (!rawKey) return "";
  return rawKey.slice(0, 8);
}

export function computeKeySuffix(rawKey: string): string {
  if (!rawKey || rawKey.length < 6) return "";
  return rawKey.slice(-4);
}

export function redactProviderKey(rawKey: string | null | undefined): string {
  if (!rawKey) return "[not set]";
  return redactSummary(rawKey, 200).replace(rawKey, "[REDACTED_PROVIDER_KEY]");
}
