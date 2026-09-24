import { createHmac, timingSafeEqual } from "node:crypto";
import type { ToolId } from "@ethen/contracts/tools/types";

const TOKEN_VERSION = "sat.v1";
const DEVELOPMENT_FALLBACK_SECRET = "ethen-dev-approval-token-secret";
const DEFAULT_SECRET_ENV_KEY = "APPROVAL_TOKEN_SECRET";

export interface SignedApprovalTokenClaims {
  v: typeof TOKEN_VERSION;
  proposalId: string;
  toolId: ToolId;
  payloadHash: string;
  sessionId: string | null;
  userId: string | null;
  expiresAt: string;
  issuedAt: string;
}

export type SignedApprovalTokenFailureCode =
  | "missing_token"
  | "malformed_token"
  | "unsigned_token"
  | "invalid_signature"
  | "unsupported_version"
  | "secret_unavailable"
  | "expired_token"
  | "proposal_id_mismatch"
  | "tool_id_mismatch"
  | "payload_hash_mismatch"
  | "session_id_mismatch"
  | "user_id_mismatch"
  | "expires_at_mismatch";

export interface SignedApprovalTokenFailure {
  code: SignedApprovalTokenFailureCode;
  message: string;
}

export interface SignSignedApprovalTokenInput {
  proposalId: string;
  toolId: ToolId;
  payloadHash: string;
  sessionId?: string | null;
  userId?: string | null;
  expiresAt: string;
  issuedAt?: string;
  secret?: string;
}

export interface ValidateSignedApprovalTokenInput {
  token: string | null | undefined;
  expected: {
    proposalId: string;
    toolId: ToolId;
    payloadHash: string;
    sessionId?: string | null;
    userId?: string | null;
    expiresAt: string;
  };
  secret?: string;
  now?: Date;
}

export type SignSignedApprovalTokenResult =
  | { ok: true; token: string; claims: SignedApprovalTokenClaims }
  | { ok: false; failure: SignedApprovalTokenFailure };

export type ValidateSignedApprovalTokenResult =
  | { ok: true; claims: SignedApprovalTokenClaims }
  | { ok: false; failure: SignedApprovalTokenFailure };

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function canonicalizeClaims(input: SignSignedApprovalTokenInput): SignedApprovalTokenClaims {
  return {
    v: TOKEN_VERSION,
    proposalId: input.proposalId,
    toolId: input.toolId,
    payloadHash: input.payloadHash,
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    expiresAt: input.expiresAt,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
  };
}

function getSecret(secretOverride?: string): { ok: true; secret: string } | { ok: false; failure: SignedApprovalTokenFailure } {
  const provided = secretOverride?.trim();
  if (provided) {
    return { ok: true, secret: provided };
  }

  const envSecret = process.env[DEFAULT_SECRET_ENV_KEY]?.trim();
  if (envSecret) {
    return { ok: true, secret: envSecret };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      failure: {
        code: "secret_unavailable",
        message: `${DEFAULT_SECRET_ENV_KEY} is required to issue or validate approval tokens in production.`,
      },
    };
  }

  return { ok: true, secret: DEVELOPMENT_FALLBACK_SECRET };
}

function signPayload(payloadPart: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

function parseToken(token: string): { payloadPart: string; signaturePart: string; claims: SignedApprovalTokenClaims } | { failure: SignedApprovalTokenFailure } {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return {
      failure: {
        code: "malformed_token",
        message: "Approval token must contain exactly two dot-separated parts.",
      },
    };
  }

  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) {
    return {
      failure: {
        code: "unsigned_token",
        message: "Approval token is missing a payload or signature.",
      },
    };
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payloadPart)) as SignedApprovalTokenClaims;
    return { payloadPart, signaturePart, claims: parsed };
  } catch {
    return {
      failure: {
        code: "malformed_token",
        message: "Approval token payload is not valid JSON.",
      },
    };
  }
}

function compareSignatures(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function signSignedApprovalToken(
  input: SignSignedApprovalTokenInput,
): SignSignedApprovalTokenResult {
  const secretResult = getSecret(input.secret);
  if (!secretResult.ok) {
    return secretResult;
  }

  const claims = canonicalizeClaims(input);
  const payloadPart = base64UrlEncode(JSON.stringify(claims));
  const signaturePart = signPayload(payloadPart, secretResult.secret);
  return {
    ok: true,
    token: `${payloadPart}.${signaturePart}`,
    claims,
  };
}

export function validateSignedApprovalToken(
  input: ValidateSignedApprovalTokenInput,
): ValidateSignedApprovalTokenResult {
  if (!input.token?.trim()) {
    return {
      ok: false,
      failure: {
        code: "missing_token",
        message: "Approval token is required for state-changing execution.",
      },
    };
  }

  const parsed = parseToken(input.token.trim());
  if ("failure" in parsed) {
    return { ok: false, failure: parsed.failure };
  }

  const secretResult = getSecret(input.secret);
  if (!secretResult.ok) {
    return secretResult;
  }

  const expectedSignature = signPayload(parsed.payloadPart, secretResult.secret);
  if (!compareSignatures(expectedSignature, parsed.signaturePart)) {
    return {
      ok: false,
      failure: {
        code: "invalid_signature",
        message: "Approval token signature is invalid.",
      },
    };
  }

  const claims = parsed.claims;

  if (claims.v !== TOKEN_VERSION) {
    return {
      ok: false,
      failure: {
        code: "unsupported_version",
        message: `Approval token version "${String(claims.v)}" is not supported.`,
      },
    };
  }

  const now = input.now ?? new Date();
  if (new Date(claims.expiresAt).getTime() <= now.getTime()) {
    return {
      ok: false,
      failure: {
        code: "expired_token",
        message: `Approval token expired at ${claims.expiresAt}.`,
      },
    };
  }

  if (claims.proposalId !== input.expected.proposalId) {
    return {
      ok: false,
      failure: {
        code: "proposal_id_mismatch",
        message: "Approval token does not match the requested proposal.",
      },
    };
  }

  if (claims.toolId !== input.expected.toolId) {
    return {
      ok: false,
      failure: {
        code: "tool_id_mismatch",
        message: "Approval token does not match the requested tool.",
      },
    };
  }

  if (claims.payloadHash !== input.expected.payloadHash) {
    return {
      ok: false,
      failure: {
        code: "payload_hash_mismatch",
        message: "Approval token payload hash does not match the execution payload.",
      },
    };
  }

  if ((claims.sessionId ?? null) !== (input.expected.sessionId ?? null)) {
    return {
      ok: false,
      failure: {
        code: "session_id_mismatch",
        message: "Approval token session binding does not match the current execution context.",
      },
    };
  }

  if ((claims.userId ?? null) !== (input.expected.userId ?? null)) {
    return {
      ok: false,
      failure: {
        code: "user_id_mismatch",
        message: "Approval token user binding does not match the current execution context.",
      },
    };
  }

  if (claims.expiresAt !== input.expected.expiresAt) {
    return {
      ok: false,
      failure: {
        code: "expires_at_mismatch",
        message: "Approval token expiry does not match the approved proposal.",
      },
    };
  }

  return { ok: true, claims };
}
