import type { SupabaseClient, User } from "@supabase/supabase-js";

export type GatewayPlatformState = "ready" | "setup-required" | "unauthenticated";

export interface GatewayPlatformContext {
  state: GatewayPlatformState;
  user: User | null;
  service: SupabaseClient | null;
  reason: string | null;
}

export interface GatewayPlatformProject {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  status: "private_alpha" | "active" | "archived";
  ownerUserId: string;
  membershipRole: "owner" | "admin" | "member" | "viewer";
  createdAt: string;
  updatedAt: string;
}

export interface GatewayApiKeyMetadata {
  id: string;
  projectId: string;
  name: string;
  environment: "live" | "test";
  keyPrefix: string;
  keySuffix: string;
  scopes: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
}

export interface GatewayApiKeyCreationResult {
  rawKey: string;
  metadata: GatewayApiKeyMetadata;
}

export interface GatewayKeyCreateInput {
  projectId: string;
  name: string;
  environment?: "live" | "test";
  scopes?: string[];
  expiresAt?: string | null;
}

export interface GatewayProjectAccess {
  project: GatewayPlatformProject | null;
  allowed: boolean;
  reason: string | null;
}

export interface GatewayProviderAttemptRecord {
  id: string;
  requestLogId: string;
  projectId: string;
  attemptNumber: number;
  providerId: string;
  modelId: string | null;
  succeeded: boolean;
  errorCode: string | null;
  errorMessageRedacted: string | null;
  latencyMs: number | null;
  outcome: "succeeded" | "failed";
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  priceRecordId: string | null;
  createdAt: string;
}

export interface GatewayRequestLogRecord {
  id: string;
  projectId: string;
  gatewayApiKeyId: string | null;
  userId: string | null;
  requestId: string;
  traceId: string | null;
  routeId: string | null;
  modelId: string | null;
  providerId: string | null;
  statusCode: number | null;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  fallbackUsed: boolean;
  errorCode: string | null;
  createdAt: string;
  projectName?: string | null;
  attempts: GatewayProviderAttemptRecord[];
}

export interface GatewayUsageEventRecord {
  id: string;
  projectId: string;
  gatewayRequestLogId: string | null;
  gatewayApiKeyId: string | null;
  userId: string | null;
  traceId: string | null;
  providerId: string | null;
  modelId: string | null;
  routeId: string | null;
  eventType: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  createdAt: string;
  projectName?: string | null;
}

export interface GatewayUsageSummaryRow {
  dimension: "project" | "model" | "provider";
  key: string;
  label: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface GatewayUsageSummary {
  totals: {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  rows: GatewayUsageSummaryRow[];
  events: GatewayUsageEventRecord[];
}

export interface GatewayBudgetLimitRecord {
  id: string;
  projectId: string;
  monthlyUsdLimit: number | null;
  dailyUsdLimit: number | null;
  monthlyTokenLimit: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GatewayScaffoldBanner {
  tone: "info" | "warning";
  title: string;
  body: string;
}

// ── P1-9 Resumable Streams ──────────────────────────────────────────────

export type StreamStatus =
  | "live"
  | "completed"
  | "failed"
  | "interrupted"
  | "expired"
  | "replaying";

export type StreamSegmentKind =
  | "delta"
  | "citation"
  | "tool_event"
  | "usage"
  | "final"
  | "error"
  | "heartbeat";

export type StreamSubscriberMode = "owner" | "resume" | "follow" | "replay";

export type StreamResumeTokenMode = "resume" | "follow" | "replay";

export interface StreamStateRecord {
  id: string;
  streamId: string;
  gatewayRequestId: string;
  gatewayRequestLogId: string | null;
  projectId: string;
  userId: string | null;
  traceId: string;
  modelId: string | null;
  providerId: string | null;
  routeId: string | null;
  status: StreamStatus;
  idempotencyKey: string;
  producerLockKey: string | null;
  firstSequence: number;
  lastSequence: number;
  finalCharOffset: number;
  finalByteOffset: number;
  finalTranscriptSha256: string | null;
  partialTranscript: string | null;
  contentLoggingMode: string;
  providerCallStartedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  errorClass: string | null;
  errorMessageRedacted: string | null;
  gatewayApiKeyId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StreamSegmentRecord {
  id: string;
  streamStateId: string;
  streamId: string;
  projectId: string;
  sequence: number;
  eventId: string;
  segmentKind: StreamSegmentKind;
  charOffsetStart: number;
  charOffsetEnd: number;
  byteOffsetStart: number;
  byteOffsetEnd: number;
  deltaSha256: string | null;
  eventPayload: Record<string, unknown>;
  createdAt: string;
}

export interface StreamSubscriberRecord {
  id: string;
  streamStateId: string;
  streamId: string;
  projectId: string;
  subscriberId: string;
  userId: string | null;
  clientId: string | null;
  mode: StreamSubscriberMode;
  connectedAt: string;
  disconnectedAt: string | null;
  lastSeenSequence: number;
  lastSeenEventId: string | null;
  userAgentHash: string | null;
  ipHash: string | null;
  createdAt: string;
}

export interface StreamResumeTokenRecord {
  id: string;
  streamStateId: string;
  streamId: string;
  projectId: string;
  userId: string | null;
  tokenHash: string;
  allowedFromSequence: number;
  allowedMode: StreamResumeTokenMode;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface StreamEventRecord {
  id: string;
  streamStateId: string;
  streamId: string;
  projectId: string;
  eventType: string;
  sequence: number | null;
  traceId: string;
  visibleInReceipt: boolean;
  payload: Record<string, unknown>;
  createdAt: string;
}
