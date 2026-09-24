/** Studio V5 realtime — managed media transport adapter (STUDIO_16, server-only). */
import "server-only";
import { randomUUID } from "node:crypto";
import {
  REALTIME_CREDENTIAL_MAX_TTL_SECONDS,
  realtimeError,
  type RealtimeReadiness,
  type RealtimeSessionRecord,
  type RealtimeSubstrate,
  type RealtimeTransportCredential,
  type RealtimeTransportMode,
} from "./types";

/**
 * Managed media transport adapter port. Ethen owns session/control state and
 * the server-side provider attachment; the adapter only attaches/detaches
 * media and reports transport health. No adapter ever mints economics or
 * bypasses admission.
 */
export interface RealtimeTransportAdapter {
  readonly substrate: RealtimeSubstrate;
  /** Attach the server-side provider leg for a session epoch. */
  attach(input: {
    sessionId: string;
    epoch: number;
    transportMode: RealtimeTransportMode;
    agentSnapshot: RealtimeSessionRecord["agentSnapshot"];
  }): Promise<{ attachmentId: string; providerSessionRef: string }>;
  /** Detach the provider leg (idempotent). */
  detach(input: { sessionId: string; epoch: number; reason: string }): Promise<void>;
  /** Transport health probe; false closes admission for new sessions. */
  healthy(): Promise<boolean>;
}

/** Synthetic transport for tests and local UI flows. Never touches a provider. */
export class SyntheticRealtimeTransport implements RealtimeTransportAdapter {
  readonly substrate: RealtimeSubstrate = "synthetic";
  readonly attachments = new Map<string, { attachmentId: string; providerSessionRef: string }>();
  private healthyFlag = true;

  setHealthy(healthy: boolean): void {
    this.healthyFlag = healthy;
  }

  async attach(input: {
    sessionId: string;
    epoch: number;
    transportMode: RealtimeTransportMode;
  }): Promise<{ attachmentId: string; providerSessionRef: string }> {
    if (!this.healthyFlag) {
      throw realtimeError("PROVIDER_ERROR", "Synthetic transport is unhealthy.", {}, true);
    }
    const key = `${input.sessionId}:e${input.epoch}`;
    const existing = this.attachments.get(key);
    if (existing) return existing;
    const record = {
      attachmentId: randomUUID(),
      providerSessionRef: `synthetic-${input.transportMode}-${input.sessionId}-e${input.epoch}`,
    };
    this.attachments.set(key, record);
    return record;
  }

  async detach(input: { sessionId: string; epoch: number; reason: string }): Promise<void> {
    void input.reason;
    this.attachments.delete(`${input.sessionId}:e${input.epoch}`);
  }

  async healthy(): Promise<boolean> {
    return this.healthyFlag;
  }
}

export interface TransportRegistryConfig {
  substrate: RealtimeSubstrate;
  /** Explicit transport mode; required — no silent default switch. */
  transportMode: RealtimeTransportMode | null;
  /** LiveKit (or substrate) credentials present. Absent yields closed readiness. */
  credentialsPresent: boolean;
}

/**
 * Selected managed media transport registry. The substrate + mode are explicit
 * deployment configuration; an unconfigured substrate reports closed
 * readiness instead of inventing an ephemeral token.
 */
export class RealtimeTransportRegistry {
  private readonly adapters = new Map<RealtimeSubstrate, RealtimeTransportAdapter>();

  register(adapter: RealtimeTransportAdapter): void {
    this.adapters.set(adapter.substrate, adapter);
  }

  adapterFor(substrate: RealtimeSubstrate): RealtimeTransportAdapter | null {
    return this.adapters.get(substrate) ?? null;
  }

  readiness(config: TransportRegistryConfig): RealtimeReadiness {
    if (!config.transportMode) {
      return {
        ready: false,
        code: "REALTIME_TRANSPORT_UNAVAILABLE",
        reason: "Realtime transport mode is not configured; explicit pipeline/native selection is required.",
      };
    }
    if (config.substrate !== "synthetic" && !config.credentialsPresent) {
      return {
        ready: false,
        code: "REALTIME_SUBSTRATE_UNCONFIGURED",
        reason: "Realtime media substrate credentials are absent; Voice Agents are unavailable.",
      };
    }
    const adapter = this.adapters.get(config.substrate);
    if (!adapter) {
      return {
        ready: false,
        code: "REALTIME_TRANSPORT_UNAVAILABLE",
        reason: `No transport adapter is registered for substrate "${config.substrate}".`,
      };
    }
    return { ready: true, substrate: config.substrate, transportMode: config.transportMode };
  }
}

/**
 * Mint policy for short-lived scoped client transport credentials. Fails
 * closed: terminal/revoked sessions stop, replay within TTL is rejected, and
 * TTL is bounded above — the credential never outlives the session epoch.
 */
export function mintTransportCredential(input: {
  session: RealtimeSessionRecord;
  substrate: RealtimeSubstrate;
  existing: RealtimeTransportCredential | null;
  ttlSeconds?: number;
  now?: string;
}): RealtimeTransportCredential {
  const now = input.now ?? new Date().toISOString();
  if (input.session.status === "ENDED" || input.session.status === "REVOKED" || input.session.status === "ERRORED") {
    throw realtimeError("CONFLICT", `Session ${input.session.sessionId} is terminal; no transport credential is issued.`, {
      status: input.session.status,
    });
  }
  if (input.existing && !input.existing.revoked && input.existing.epoch === input.session.epoch) {
    if (Date.parse(input.existing.expiresAt) > Date.parse(now)) {
      throw realtimeError("CONFLICT", "An active transport credential already exists for this epoch; replay is not allowed.", {
        credentialId: input.existing.credentialId,
      });
    }
  }
  const ttlSeconds = Math.min(
    input.ttlSeconds ?? REALTIME_CREDENTIAL_MAX_TTL_SECONDS,
    REALTIME_CREDENTIAL_MAX_TTL_SECONDS,
  );
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw realtimeError("BAD_REQUEST", "Credential TTL must be a positive integer number of seconds.");
  }
  return {
    credentialId: randomUUID(),
    sessionId: input.session.sessionId,
    epoch: input.session.epoch,
    substrate: input.substrate,
    token: `rt-${input.session.sessionId}-${input.session.epoch}-${randomUUID().slice(0, 8)}`,
    issuedAt: now,
    expiresAt: new Date(Date.parse(now) + ttlSeconds * 1000).toISOString(),
    ttlSeconds,
    revoked: false,
  };
}
