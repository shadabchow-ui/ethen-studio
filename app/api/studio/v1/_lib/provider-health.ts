/**
 * Studio V5 M4 — measured provider health (route logic, injectable).
 *
 * Reports what is MEASURED, never what flags claim: credentials present
 * (key material only — ETHEN_STUDIO_*_READY flags never count),
 * unauthenticated reachability probes (60s cached), registry membership,
 * catalog qualification (an enabled endpoint with an attestation, or the
 * local-lane schema-known equivalent), worker heartbeat freshness, and
 * object-store write/read probes. Every probe is injectable, so the
 * truth table runs hermetically; the route passes no overrides.
 *
 * No `server-only` marker: `node:fs` already confines the storage probe
 * to the server (memory-catalog precedent), and the M4 suite imports
 * this module directly.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FAL_ADAPTER_NAME } from "@ethen/studio-core/server/providers/fal-constants";
import { FAL_QUEUE_BASE_URL } from "@ethen/studio-core/server/providers/fal-request";
import { OPENAI_ADAPTER_NAME } from "@ethen/studio-core/server/providers/adapters/openai";
import { getDefaultProviderRegistry } from "@ethen/studio-core/server/providers/registry";
import { registerStudioCatalogAdapters } from "@ethen/studio-core/server/providers/registration";
import { listLocalCatalogSource } from "./memory-catalog";
import type { requireServiceClient as requireServiceClientFn } from "./supabase-data";

type ServiceClient = ReturnType<typeof requireServiceClientFn>;

/**
 * The Supabase lane loads lazily: supabase-data carries app-scoped
 * imports the hermetic suite never resolves, and injected probes mean
 * tests never reach these defaults.
 */
async function serviceClient(): Promise<ServiceClient> {
  const { requireServiceClient } = await import("./supabase-data");
  return requireServiceClient();
}

export const PROVIDER_HEALTH_PROBE_TTL_MS = 60_000;
/** A beat counts while younger than 6x the 5s worker tick. */
export const WORKER_HEARTBEAT_FRESH_MS = 30_000;
const PROBE_TIMEOUT_MS = 3_000;

export type StudioHealthProviderId = "fal" | "openai";

export interface StudioProviderHealth {
  configured: boolean;
  reachable: boolean;
  registered: boolean;
  catalogQualified: boolean;
  workerReady: boolean;
  storageReady: boolean;
}

export interface StudioProvidersHealthReport {
  providers: Record<StudioHealthProviderId, StudioProviderHealth>;
  measuredAt: string;
}

export interface ProviderHealthDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
  localLane?: boolean;
  registered?: (adapterName: string) => boolean;
  catalogQualified?: (providerId: StudioHealthProviderId) => Promise<boolean>;
  /** Age of the freshest worker heartbeat, or null when none is readable. */
  heartbeatAgeMs?: () => Promise<number | null>;
  storageReady?: () => Promise<boolean>;
}

const probeCache = new Map<string, { at: number; value: boolean }>();

/** Test-only: drop cached probe verdicts between truth-table rows. */
export function resetProviderHealthProbeCache(): void {
  probeCache.clear();
}

async function probeReachable(url: string, fetchImpl: typeof fetch, nowMs: () => number): Promise<boolean> {
  const now = nowMs();
  const hit = probeCache.get(url);
  if (hit && now - hit.at < PROVIDER_HEALTH_PROBE_TTL_MS) return hit.value;
  let value = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // Unauthenticated on purpose: any HTTP answer (even 4xx) proves the
    // endpoint is up; only transport failure means unreachable.
    await fetchImpl(url, { method: "GET", redirect: "manual", signal: controller.signal });
    value = true;
  } catch {
    value = false;
  } finally {
    clearTimeout(timer);
  }
  probeCache.set(url, { at: now, value });
  return value;
}

function defaultRegistered(adapterName: string): boolean {
  try {
    return registerStudioCatalogAdapters(getDefaultProviderRegistry()).has(adapterName);
  } catch {
    return false;
  }
}

async function defaultCatalogQualified(providerId: StudioHealthProviderId, localLane: boolean): Promise<boolean> {
  try {
    if (localLane) {
      const source = await listLocalCatalogSource();
      return source.some((row) => row.providerId === providerId && row.tasks.length > 0 && row.schemaKnown);
    }
    const client = await serviceClient();
    const { data: endpoints } = await client
      .from("studio_v5_endpoints")
      .select("endpoint_id")
      .eq("provider_id", providerId)
      .eq("enabled", true)
      .limit(25);
    const ids = ((endpoints ?? []) as Array<{ endpoint_id?: unknown }>)
      .map((row) => row.endpoint_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) return false;
    const { data: attestations } = await client
      .from("studio_v5_endpoint_attestations")
      .select("endpoint_id")
      .in("endpoint_id", ids)
      .limit(1);
    return (attestations ?? []).length > 0;
  } catch {
    return false;
  }
}

async function defaultHeartbeatAgeMs(): Promise<number | null> {
  try {
    const client = await serviceClient();
    const { data } = await client
      .from("studio_v5_worker_heartbeats")
      .select("last_beat_at")
      .order("last_beat_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as { last_beat_at?: unknown } | undefined;
    if (!row || typeof row.last_beat_at !== "string") return null;
    const at = Date.parse(row.last_beat_at);
    return Number.isFinite(at) ? Date.now() - at : null;
  } catch {
    return null;
  }
}

async function defaultStorageReady(env: NodeJS.ProcessEnv): Promise<boolean> {
  if (env.STUDIO_LOCAL_RUNTIME === "fixture") {
    try {
      const root = env.STUDIO_LOCAL_STORE_DIR?.trim() ? env.STUDIO_LOCAL_STORE_DIR.trim() : join(process.cwd(), ".studio-fixture-store");
      mkdirSync(root, { recursive: true });
      const name = `health-probe-${randomUUID()}.json`;
      writeFileSync(join(root, name), JSON.stringify({ probe: true }));
      const read = readFileSync(join(root, name), "utf8");
      unlinkSync(join(root, name));
      return read.includes("probe");
    } catch {
      return false;
    }
  }
  const bucket = env.STUDIO_STORAGE_BUCKET?.trim() ? env.STUDIO_STORAGE_BUCKET.trim() : null;
  if (!bucket) return false;
  try {
    const client = await serviceClient();
    const key = `health/probe-${randomUUID()}.json`;
    const bytes = new TextEncoder().encode(JSON.stringify({ probe: true }));
    const uploaded = await client.storage.from(bucket).upload(key, bytes, { contentType: "application/json" });
    if (uploaded.error) return false;
    const downloaded = await client.storage.from(bucket).download(key);
    await client.storage.from(bucket).remove([key]).catch(() => null);
    if (downloaded.error || !downloaded.data) return false;
    return (await downloaded.data.text()).includes("probe");
  } catch {
    return false;
  }
}

const ADAPTER_FOR_PROVIDER: Record<StudioHealthProviderId, string> = {
  fal: FAL_ADAPTER_NAME,
  openai: OPENAI_ADAPTER_NAME,
};

export async function checkProvidersHealth(deps: ProviderHealthDeps = {}): Promise<StudioProvidersHealthReport> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const nowMs = deps.nowMs ?? Date.now;
  const localLane = deps.localLane ?? false;

  const falBase = env.STUDIO_FAL_FIXTURE_URL?.trim() ? env.STUDIO_FAL_FIXTURE_URL.trim() : FAL_QUEUE_BASE_URL;
  const [falReachable, openaiReachable] = await Promise.all([
    probeReachable(`${falBase.replace(/\/+$/, "")}/`, fetchImpl, nowMs),
    probeReachable("https://api.openai.com/", fetchImpl, nowMs),
  ]);
  const isRegistered = deps.registered ?? defaultRegistered;
  const isCatalogQualified =
    deps.catalogQualified ?? ((providerId) => defaultCatalogQualified(providerId, localLane));
  const heartbeatAge = await (deps.heartbeatAgeMs ?? defaultHeartbeatAgeMs)();
  const workerReady = heartbeatAge !== null && heartbeatAge < WORKER_HEARTBEAT_FRESH_MS;
  const storeReady = await (deps.storageReady ?? (() => defaultStorageReady(env)))();

  const configured: Record<StudioHealthProviderId, boolean> = {
    fal: (env.FAL_KEY ?? "").trim().length > 0,
    openai: (env.OPENAI_API_KEY ?? "").trim().length > 0,
  };
  const providers = {} as Record<StudioHealthProviderId, StudioProviderHealth>;
  for (const providerId of ["fal", "openai"] as const) {
    providers[providerId] = {
      configured: configured[providerId],
      reachable: providerId === "fal" ? falReachable : openaiReachable,
      registered: isRegistered(ADAPTER_FOR_PROVIDER[providerId]),
      catalogQualified: await isCatalogQualified(providerId),
      workerReady,
      storageReady: storeReady,
    };
  }
  return { providers, measuredAt: new Date(nowMs()).toISOString() };
}
