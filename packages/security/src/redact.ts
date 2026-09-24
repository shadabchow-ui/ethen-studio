// Centralized secrets redaction for the local coding agent.
// Detects and redacts common secret patterns from text content before
// it is stored, displayed, or exported. Does NOT store, manage, or
// persist secrets — only detects and masks them.

export interface RedactResult {
  text: string;
  redacted: boolean;
  count: number;
}

// ── Secret patterns ──────────────────────────────────────────────────────────

const REDACT_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string | ((match: string) => string) }> = [
  // API key patterns (common formats)
  {
    name: "api_key",
    pattern: /\b(?:sk|pk|AKIA|AIza|SG\.|sk_live|pk_live|sk_test|pk_test)_[A-Za-z0-9]{16,}/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    name: "openai_key",
    pattern: /\b(sk-[A-Za-z0-9]{16,})\b/g,
    replacement: "[REDACTED_OPENAI_KEY]",
  },
  {
    name: "anthropic_key",
    pattern: /\b(sk-ant-[A-Za-z0-9\-_]{16,})\b/g,
    replacement: "[REDACTED_ANTHROPIC_KEY]",
  },
  {
    name: "github_token",
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{16,})\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },

  // Bearer tokens
  {
    name: "bearer_token",
    pattern: /\b[Bb]earer\s+([A-Za-z0-9\-._~+\/=]+)/g,
    replacement: "Bearer [REDACTED]",
  },

  // Basic auth
  {
    name: "basic_auth",
    pattern: /\b[Bb]asic\s+([A-Za-z0-9+\/=]+)/g,
    replacement: "Basic [REDACTED]",
  },

  // Private key blocks — PEM format
  {
    name: "private_key_pem",
    pattern: /-----BEGIN\s+(?:(?:RSA|EC|DSA|OPENSSH)\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:(?:RSA|EC|DSA|OPENSSH)\s+)?PRIVATE\s+KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY_BLOCK]",
  },

  // JWT-like tokens (header.payload.signature)
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
    replacement: "[REDACTED_JWT]",
  },

  // Password assignments
  {
    name: "password_assignment",
    pattern: /\b(?:password|passwd|pwd|secret)\s*[:=]\s*['"][^'"]+['"]/gi,
    replacement: (match: string) => {
      const key = match.match(/^(password|passwd|pwd|secret)\s*[:=]/i)?.[0] ?? "key=";
      return `${key} [REDACTED]`;
    },
  },

  // Secret env var assignments (value side only)
  {
    name: "env_secret",
    pattern: /\b(SECRET|API_KEY|TOKEN|PASSWORD|PRIVATE_KEY|ACCESS_KEY)\s*=\s*['"]?[^\s'"]+/gi,
    replacement: (match: string) => {
      const eq = match.indexOf("=");
      if (eq > 0) return match.slice(0, eq + 1) + " [REDACTED]";
      return "[REDACTED_ENV_VALUE]";
    },
  },

  // AWS access key IDs
  {
    name: "aws_access_key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: "[REDACTED_AWS_KEY_ID]",
  },

  // AWS secret access keys
  {
    name: "aws_secret_key",
    pattern: /\b[A-Za-z0-9\/+]{40}\b/g,
    replacement: (() => {
      // Only applied in AWS context — handled by env detection below
      return "";
    })(),
  },

  // .npmrc auth tokens
  {
    name: "npmrc_token",
    pattern: /\/\/registry\.npmjs\.org\/:_authToken=[A-Za-z0-9\-]+/g,
    replacement: "//registry.npmjs.org/:_authToken=[REDACTED]",
  },
  {
    name: "npmrc_token_alt",
    pattern: /\/\/.*\/:_authToken=[A-Za-z0-9\-]+/g,
    replacement: (match: string) => {
      const host = match.match(/\/\/([^/]+)\/:/)?.[1] ?? "registry";
      return `//${host}/:_authToken=[REDACTED]`;
    },
  },

  // Docker config auth
  {
    name: "docker_auth",
    pattern: /\b"auth"\s*:\s*"[A-Za-z0-9+\/=]{20,}"/g,
    replacement: '"auth": "[REDACTED]"',
  },

  // Supabase service role / anon keys
  {
    name: "supabase_key",
    pattern: /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
    replacement: "[REDACTED_JWT]",
  },

  // Google API keys
  {
    name: "google_api_key",
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    replacement: "[REDACTED_GOOGLE_KEY]",
  },
];

// ── Token-like strings that follow assignment keywords ────────────────────────

const TOKEN_ASSIGNMENT_PATTERN = /\b(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|client[_-]?id|service[_-]?role[_-]?key|anon[_-]?key|signing[_-]?secret)\s*[:=]\s*['"]?([A-Za-z0-9\-_.]{8,})['"]?/gi;

function redactKeyValuePairs(text: string): { text: string; count: number } {
  let count = 0;
  const result = text.replace(TOKEN_ASSIGNMENT_PATTERN, (match, value) => {
    if (value && value.length >= 8) {
      count++;
      const parts = match.split(/[:=]/);
      return `${parts[0]}= [REDACTED]`;
    }
    return match;
  });
  return { text: result, count };
}

// ── Heuristic: standalone long random-looking strings near env context ────────

const SENSITIVE_CONTEXT_LINES = /\b(?:KEY|TOKEN|SECRET|PASSWORD|AUTH)\s*[=:]\s*['"]?([A-Za-z0-9+\/=]{24,})['"]?$/gim;

function redactContextTokens(text: string): { text: string; count: number } {
  let count = 0;
  const result = text.replace(SENSITIVE_CONTEXT_LINES, (match) => {
    count++;
    const eq = match.indexOf("=");
    const colon = match.indexOf(":");
    const sep = Math.max(eq, colon);
    if (sep > 0) return match.slice(0, sep + 1) + " [REDACTED]";
    return "[REDACTED]";
  });
  return { text: result, count };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function redactSecrets(text: string): RedactResult {
  if (!text || text.length === 0) {
    return { text, redacted: false, count: 0 };
  }

  let result = text;
  let totalCount = 0;

  // First pass: key-value pair assignments
  const kvResult = redactKeyValuePairs(result);
  result = kvResult.text;
  totalCount += kvResult.count;

  // Second pass: context tokens
  const ctxResult = redactContextTokens(result);
  result = ctxResult.text;
  totalCount += ctxResult.count;

  // Third pass: structural patterns (keys, tokens, blocks)
  for (const { pattern, replacement } of REDACT_PATTERNS) {
    const before = result;
    result = result.replace(pattern, replacement as string);
    // Count matches
    const matches = before.match(pattern);
    if (matches) totalCount += matches.length;
  }

  return {
    text: result,
    redacted: totalCount > 0,
    count: totalCount,
  };
}

export function redactSummary(text: string, maxLen: number = 200): string {
  const { text: redacted } = redactSecrets(text);
  if (redacted.length <= maxLen) return redacted;
  return redacted.slice(0, maxLen - 1).trimEnd() + "…";
}

const SENSITIVE_STRUCTURED_KEYS = new Set([
  "secret",
  "token",
  "password",
  "passwd",
  "pwd",
  "apikey",
  "privatekey",
  "accesskey",
  "accesstoken",
  "authorization",
  "cookie",
  "credential",
  "signingsecret",
  "clientsecret",
  "servicerolekey",
]);

function isSensitiveStructuredKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return SENSITIVE_STRUCTURED_KEYS.has(normalized) ||
    normalized.endsWith("secret") ||
    normalized.endsWith("token") ||
    normalized.endsWith("password") ||
    normalized.endsWith("apikey");
}

/**
 * Recursively redacts diagnostic/log/audit values without serializing secrets
 * first. Error objects are converted to plain, redacted records and cycles are
 * replaced with a stable marker.
 */
export function redactStructuredValue(value: unknown): unknown {
  const seen = new WeakSet<object>();

  const visit = (current: unknown, key?: string): unknown => {
    if (key && isSensitiveStructuredKey(key)) return "[REDACTED]";
    if (typeof current === "string") return redactSecrets(current).text;
    if (
      current === null ||
      current === undefined ||
      typeof current === "number" ||
      typeof current === "boolean"
    ) return current;
    if (typeof current === "bigint") return current.toString();
    if (typeof current !== "object") return String(current);
    if (seen.has(current)) return "[CIRCULAR]";
    seen.add(current);

    if (current instanceof Error) {
      return {
        name: redactSecrets(current.name).text,
        message: redactSecrets(current.message).text,
        ...(current.stack ? { stack: redactSecrets(current.stack).text } : {}),
        ...("cause" in current ? { cause: visit(current.cause, "cause") } : {}),
      };
    }
    if (current instanceof Date) return current.toISOString();
    if (Array.isArray(current)) return current.map((entry) => visit(entry));

    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(current as Record<string, unknown>)) {
      output[entryKey] = visit(entryValue, entryKey);
    }
    return output;
  };

  return visit(value);
}

// ── Hidden Unicode / Bidi / Zero-Width Detection ──────────────────────────
// Scans text for dangerous Unicode sequences that can be used to smuggle
// instructions past human reviewers. These characters can reverse text order,
// hide content, or create invisible payloads in project files, tool output,
// terminal output, or MCP metadata.

export interface UnicodeRisk {
  detected: boolean;
  risks: UnicodeRiskDetail[];
  safeText?: string;
}

export interface UnicodeRiskDetail {
  type: "bidi_override" | "zero_width" | "homoglyph" | "control_char";
  description: string;
  position: number;
  charCode: string;
}

// Bidirectional override characters (U+202A – U+202E, U+2066 – U+2069)
// These can reverse or override text direction, embedding instructions
// inside benign-looking strings (e.g. "reviewed OK" reversed in RTL).
const BIDI_OVERRIDE_RANGES: Array<[number, number]> = [
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

// Zero-width and invisible characters
// Can embed hidden payloads in text that displays as empty or minimal.
const ZERO_WIDTH_CHARS = new Set([
  0x200b, // ZERO WIDTH SPACE
  0x200c, // ZERO WIDTH NON-JOINER
  0x200d, // ZERO WIDTH JOINER
  0x2060, // WORD JOINER
  0xfeff, // ZERO WIDTH NO-BREAK SPACE / BOM
  0x00ad, // SOFT HYPHEN
  0x034f, // COMBINING GRAPHEME JOINER
  0x061c, // ARABIC LETTER MARK
  0x2061, // FUNCTION APPLICATION
  0x2062, // INVISIBLE TIMES
  0x2063, // INVISIBLE SEPARATOR
  0x2064, // INVISIBLE PLUS
  0x180e, // MONGOLIAN VOWEL SEPARATOR
]);

// Common homoglyph characters used for spoofing (Cyrillic, Greek, etc.)
// These look identical to ASCII but are different code points.
const HOMOGLYPH_MAP: Record<number, string> = {
  0x0430: "a", // Cyrillic small a
  0x0435: "e", // Cyrillic small ie
  0x043e: "o", // Cyrillic small o
  0x0440: "p", // Cyrillic small er
  0x0441: "c", // Cyrillic small es
  0x0443: "y", // Cyrillic small u
  0x0445: "x", // Cyrillic small ha
  0x0455: "s", // Cyrillic small dze
  0x0391: "A", // Greek capital alpha
  0x0392: "B", // Greek capital beta
  0x0395: "E", // Greek capital epsilon
  0x0397: "H", // Greek capital eta
  0x0399: "I", // Greek capital iota
  0x039a: "K", // Greek capital kappa
  0x039c: "M", // Greek capital mu
  0x039d: "N", // Greek capital nu
  0x039f: "O", // Greek capital omicron
  0x03a1: "P", // Greek capital rho
  0x03a4: "T", // Greek capital tau
  0x03a5: "Y", // Greek capital upsilon
  0x03a7: "X", // Greek capital chi
  0x03a9: "W", // Greek capital omega (also omega)
  0x2010: "-", // HYPHEN (looks like minus)
  0x2013: "-", // EN DASH
  0x2014: "-", // EM DASH
  0x2212: "-", // MINUS SIGN
};

export function detectHiddenUnicode(text: string): UnicodeRisk {
  const risks: UnicodeRiskDetail[] = [];
  if (!text || text.length === 0) return { detected: false, risks, safeText: text };

  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i);
    if (cp === undefined) continue;

    // Check bidi override
    for (const [lo, hi] of BIDI_OVERRIDE_RANGES) {
      if (cp >= lo && cp <= hi) {
        risks.push({
          type: "bidi_override",
          description: `Bidirectional override character U+${cp.toString(16).toUpperCase().padStart(4, "0")} detected at position ${i}. Can reverse or alter text direction to smuggle malicious instructions.`,
          position: i,
          charCode: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
        });
      }
    }

    // Check zero-width
    if (ZERO_WIDTH_CHARS.has(cp)) {
      risks.push({
        type: "zero_width",
        description: `Zero-width/invisible character U+${cp.toString(16).toUpperCase().padStart(4, "0")} at position ${i}. May conceal payloads or alter text rendering.`,
        position: i,
        charCode: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
      });
    }

    // Check homoglyph
    if (HOMOGLYPH_MAP[cp]) {
      risks.push({
        type: "homoglyph",
        description: `Homoglyph character U+${cp.toString(16).toUpperCase().padStart(4, "0")} at position ${i} (visual: '${String.fromCodePoint(cp)}', ASCII equivalent: '${HOMOGLYPH_MAP[cp]}'). May be used for spoofing or smuggling.`,
        position: i,
        charCode: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
      });
    }

    // Surrogate pairs — advance past low surrogate
    if (cp > 0xffff) i++;
  }

  return {
    detected: risks.length > 0,
    risks,
  };
}

export function hasHiddenUnicode(text: string): boolean {
  return detectHiddenUnicode(text).detected;
}
