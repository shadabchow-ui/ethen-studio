/**
 * packages/contracts/voice/usage.ts
 *
 * Canonical contracts for the VOI-07 Voice estimate/reserve/measure/settle/
 * refund authority.
 *
 * Every reservation and settlement is bound to: job/session, project, org,
 * actor, provider, model, voice, operation, pricing version, and an
 * idempotency key.
 */

/** Voice operations that the usage authority meters. */
export type VoiceUsageOperation = "tts" | "transcribe" | "realtime";

/** Quantifiable unit for each operation. */
export type VoiceUsageUnit = "characters" | "seconds" | "minutes";

/** Currency: Ethen only manufactures USD-backed cost figures today. */
export type VoicePricingCurrency = "usd";

/** Certification state of a price record. */
export type VoicePricingCertState =
  | "pending"
  | "certified"
  | "expired"
  | "revoked";

/** The scoped identity required to mutate the voice ledger. */
export interface VoiceUsageActor {
  organizationId: string;
  projectId: string;
  actorId: string;
}

/**
 * A versioned, certified price record for one operation on one
 * provider/model/voice. Version pinning means a reservation is always
 * recalculable from a stable price record.
 */
export interface VoicePricingRecord {
  /** Canonical price key, e.g. "tts:openai:tts-1". */
  id: string;
  operation: VoiceUsageOperation;
  providerId: string;
  modelId: string;
  /** Optional, for provider/model-specific voices. */
  voiceId: string | null;
  /** Version of this price record — monotonic per price key. */
  version: number;
  /** Base unit the price applies to. */
  unit: VoiceUsageUnit;
  /** Price per single `unit` in cents (integer micro-currency). */
  unitPriceUsd: number;
  currency: VoicePricingCurrency;
  /** Minimum billable unit increment (fraction of `unit`), e.g. 1 char. */
  minBillableUnit: number;
  /** Verified = real provider price checked; false = placeholder estimate. */
  verified: boolean;
  verifiedSource: string | null;
  verifiedAt: string | null;
  /** Price stops being authoritative after this instant (if set). */
  expiresAt: string | null;
  certificationState: VoicePricingCertState;
  /** Short human note. */
  note: string;
}

/**
 * Idempotent ledger mutation result. Drawn to be identical in shape whether
 * backed by an in-memory transaction buffer or the durable Supabase layer.
 */
export type VoiceUnit = VoicePricingRecord["unit"];
export type VoicePricingCurrencyValue = "usd";
