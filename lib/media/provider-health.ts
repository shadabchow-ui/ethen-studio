/**
 * Studio V2 Job 05 — provider health from measured durable outcomes.
 *
 * No stale cache, no invented scores: every call recomputes over a bounded
 * window of durable executions (jobs, takes, settlements, repairs).
 * Unmeasured providers report unknown confidence — routable only when they
 * are the sole qualified route, and then explicitly low-confidence.
 * Latency is reported only when measured; durable rows carry no timing
 * columns, so latency is unknown until a timing source lands.
 */

import "server-only";

import { createServiceClient } from "@ethen/database/service";

export type HealthConfidence = "high" | "medium" | "low" | "unknown";

export interface OutcomeSample {
  jobId: string;
  /** Terminal durable status. */
  status: string;
  accepted: boolean;
  settledCredits: number;
  repairAttempts: number;
  updatedAt: string;
}

export interface ProviderHealth {
  providerId: string;
  modelId: string;
  capability: string;
  sampleSize: number;
  successRate: number | null;
  acceptanceRate: number | null;
  avgSettledCredits: number | null;
  repairRate: number | null;
  latencyMsP50: number | null;
  lastObservedAt: string | null;
  confidence: HealthConfidence;
  /** False when the freshest sample is older than the freshness window. */
  fresh: boolean;
  unknownFields: string[];
}

/** Confidence thresholds (v1, documented): sample-size gates, nothing else. */
export function confidenceForSampleSize(n: number): HealthConfidence {
  if (n >= 30) return "high";
  if (n >= 10) return "medium";
  if (n >= 1) return "low";
  return "unknown";
}

/** Pure computation: same samples in, same health out. */
export function computeHealth(
  providerId: string,
  modelId: string,
  capability: string,
  samples: readonly OutcomeSample[],
  options?: { nowMs?: number; freshnessMs?: number },
): ProviderHealth {
  const nowMs = options?.nowMs ?? Date.now();
  const freshnessMs = options?.freshnessMs ?? 7 * 24 * 3600 * 1000;
  const unknownFields: string[] = ["latencyMsP50"];
  if (samples.length === 0) {
    return {
      providerId, modelId, capability, sampleSize: 0,
      successRate: null, acceptanceRate: null, avgSettledCredits: null, repairRate: null,
      latencyMsP50: null, lastObservedAt: null, confidence: "unknown", fresh: false,
      unknownFields: [...unknownFields, "successRate", "acceptanceRate", "avgSettledCredits", "repairRate", "lastObservedAt"],
    };
  }
  const completed = samples.filter((sample) => sample.status === "completed");
  const successRate = completed.length / samples.length;
  const acceptanceRate = completed.length > 0
    ? samples.filter((sample) => sample.accepted).length / completed.length
    : null;
  const settled = samples.filter((sample) => sample.accepted).map((sample) => sample.settledCredits);
  const avgSettledCredits = settled.length > 0 ? settled.reduce((a, b) => a + b, 0) / settled.length : null;
  const repairRate = samples.reduce((sum, sample) => sum + sample.repairAttempts, 0) / samples.length;
  const lastObservedAt = samples.map((sample) => sample.updatedAt).sort().at(-1) ?? null;
  if (acceptanceRate === null) unknownFields.push("acceptanceRate");
  if (avgSettledCredits === null) unknownFields.push("avgSettledCredits");
  return {
    providerId, modelId, capability, sampleSize: samples.length,
    successRate, acceptanceRate, avgSettledCredits, repairRate,
    latencyMsP50: null, lastObservedAt,
    confidence: confidenceForSampleSize(samples.length),
    fresh: lastObservedAt !== null && nowMs - Date.parse(lastObservedAt) <= freshnessMs,
    unknownFields,
  };
}

export interface HealthSampleQuery {
  providerId: string;
  modelId: string;
  limit?: number;
}

/**
 * Fetch bounded outcome samples from durable sources. Aggregates only —
 * no tenant content leaves the database.
 */
export async function fetchOutcomeSamples(query: HealthSampleQuery): Promise<OutcomeSample[]> {
  const client = createServiceClient();
  if (!client) throw new Error("Provider health requires a configured service client.");
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const { data: jobs, error } = await client.from("durable_jobs")
    .select("id,status,updated_at,payload")
    .eq("payload->>providerId", query.providerId)
    .eq("payload->>modelId", query.modelId)
    .in("status", ["completed", "failed", "cancelled", "dead_letter", "timed_out", "indeterminate", "escalated"])
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Provider health query failed: ${error.message}`);
  const rows = (jobs ?? []) as Array<{ id: string; status: string; updated_at: string }>;
  if (rows.length === 0) return [];
  const jobIds = rows.map((row) => row.id);
  const [takes, reservations, repairs] = await Promise.all([
    client.from("studio_takes").select("job_id,status").in("job_id", jobIds).is("deleted_at", null).then((r) => r.data ?? []),
    client.from("studio_credit_reservations").select("job_id,state,settled_credits").in("job_id", jobIds).then((r) => r.data ?? []),
    client.from("studio_repair_attempts").select("job_id").in("job_id", jobIds).is("deleted_at", null).then((r) => r.data ?? []),
  ]);
  const acceptedByJob = new Map<string, boolean>();
  for (const take of takes as Array<{ job_id: string; status: string }>) {
    if (take.status === "accepted") acceptedByJob.set(take.job_id, true);
  }
  const settledByJob = new Map<string, number>();
  for (const reservation of reservations as Array<{ job_id: string; state: string; settled_credits: number | string }>) {
    if (reservation.state === "settled") settledByJob.set(reservation.job_id, Number(reservation.settled_credits ?? 0));
  }
  const repairsByJob = new Map<string, number>();
  for (const repair of repairs as Array<{ job_id: string }>) {
    repairsByJob.set(repair.job_id, (repairsByJob.get(repair.job_id) ?? 0) + 1);
  }
  return rows.map((row) => ({
    jobId: row.id,
    status: row.status,
    accepted: acceptedByJob.get(row.id) === true,
    settledCredits: settledByJob.get(row.id) ?? 0,
    repairAttempts: repairsByJob.get(row.id) ?? 0,
    updatedAt: row.updated_at,
  }));
}
