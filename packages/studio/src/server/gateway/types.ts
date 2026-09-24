/** Studio V5 gateway — shared types and error envelope (STUDIO_19). Server-only. */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";

export type GatewayErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "QUOTE_CONFLICT"
  | "UNSUPPORTED_TASK"
  | "SSRF_BLOCKED"
  | "DELIVERY_FAILED"
  | "DEAD_LETTER"
  | "INTERNAL";

export const GATEWAY_ERROR_STATUS: Record<GatewayErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  QUOTE_CONFLICT: 409,
  UNSUPPORTED_TASK: 422,
  SSRF_BLOCKED: 422,
  DELIVERY_FAILED: 502,
  DEAD_LETTER: 410,
  INTERNAL: 500,
};

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(
    code: GatewayErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    retryable = false,
  ) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export function gatewayError(
  code: GatewayErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  retryable = false,
): GatewayError {
  return new GatewayError(code, message, details, retryable);
}

/** `"*"` grants all projects/tasks; otherwise an explicit allow-list. */
export interface KeyScope {
  projects: readonly string[];
  tasks: readonly string[];
}

export interface ApiKeyRecord {
  keyId: string;
  tenantId: string;
  name: string;
  keyHash: string;
  prefix: string;
  scope: KeyScope;
  createdBy: string;
  expiresAt: string | null;
  revokedAt: string | null;
  rotatedFromKeyId: string | null;
  legacyOrigin: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Public metadata — never carries secret material. */
export interface ApiKeyMetadata {
  keyId: string;
  name: string;
  prefix: string;
  scope: KeyScope;
  expiresAt: string | null;
  revokedAt: string | null;
  rotatedFromKeyId: string | null;
  createdAt: string;
}

export interface GatewayPrincipal {
  keyId: string;
  tenantId: string;
  actorId: string;
  scope: KeyScope;
  /** Resolved request scope; null until a concrete project is bound. */
  project: ProjectScope | null;
}

/** Opaque vault pointer. The secret itself lives in the vault, never here. */
export interface ByokReference {
  referenceId: string;
  tenantId: string;
  provider: string;
  vaultKeyId: string;
  label: string;
  createdBy: string;
  createdAt: string;
}

export interface ByokMetadata {
  referenceId: string;
  provider: string;
  label: string;
  createdAt: string;
}

export const WEBHOOK_EVENTS = [
  "job.completed",
  "job.failed",
  "job.cancelled",
  "workflow.run.completed",
  "workflow.run.failed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export interface WebhookSubscription {
  subscriptionId: string;
  tenantId: string;
  projectId: string | null;
  url: string;
  events: readonly WebhookEvent[];
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export type DeliveryStatus = "pending" | "delivered" | "retrying" | "dead_letter";

export interface WebhookDelivery {
  deliveryId: string;
  subscriptionId: string;
  tenantId: string;
  eventType: WebhookEvent;
  payloadHash: string;
  status: DeliveryStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
  lastStatusCode: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fixed retry ladder (authority §20): delays after the previous failure.
 * Initial attempt plus seven retries, then dead letter / manual redelivery.
 */
export const WEBHOOK_RETRY_LADDER_MS = [
  5_000,
  5 * 60_000,
  30 * 60_000,
  2 * 3_600_000,
  5 * 3_600_000,
  10 * 3_600_000,
  10 * 3_600_000,
] as const;

export const WEBHOOK_MAX_ATTEMPTS = 1 + WEBHOOK_RETRY_LADDER_MS.length;

/** Signed delivery envelope: timestamp + payload hash + delivery id bound. */
export interface DeliveryEnvelope {
  deliveryId: string;
  subscriptionId: string;
  eventType: WebhookEvent;
  occurredAt: string;
  timestamp: string;
  payload: Readonly<Record<string, unknown>>;
  payloadHash: string;
  signature: string;
}

/** Replay window for inbound signed deliveries/callbacks. */
export const DELIVERY_REPLAY_WINDOW_MS = 5 * 60_000;

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  statusCode: number;
  response: Readonly<Record<string, unknown>>;
  createdAt: string;
  expiresAt: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterMs: number;
}
