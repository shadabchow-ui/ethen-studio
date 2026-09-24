/**
 * Studio V5 M4 — loopback fixture lane (STUDIO_LOCAL_RUNTIME=fixture).
 *
 * The dev/test execution backend when no Supabase or Temporal fleet is
 * attached: memory runtime (jobs/attempts/operations/generations) +
 * memory economics (prices/quotes/holds/settle) + the generic fal-queue
 * adapter against the in-process fixture queue + the real ingest
 * pipeline with fixture scan/decode and a local-disk store.
 *
 * Shares the production kernel (admitJob, the provider binding, the
 * ingest pipeline, the economics stores) instead of re-implementing it;
 * only the orchestration loop mirrors the Temporal workflow, phase for
 * phase, because no Temporal server exists on this lane. Qualification
 * gates fixture execution: endpoints without a VERIFIED price and a
 * real canary cap at PARTIALLY_QUALIFIED and execute only with
 * ETHEN_STUDIO_ALLOW_PARTIAL=1. Fixture minor is scripted (never real
 * spend) and every round-trip is recorded as an attestation.
 */
import "server-only";

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskName } from "../../contracts/tasks";
import { DEFAULT_VERSION_PINS, asIcu } from "../../contracts";
import type { ProjectScope } from "../../contracts/scope";
import type { VersionPins } from "../../contracts/versions";
import { mapFalSlug } from "../../catalog/task-map";
import {
  buildLocalSource,
  type CatalogSourceEndpoint,
  type LocalCatalogJson,
  type SchemaSnapshotDoc,
} from "../../catalog/source-local";
import type { EndpointSpec } from "../../catalog/types";
import { createMemoryOperationStore, type ProviderOperationStore } from "../providers/operation-store";
import {
  createWorkerProviderBinding,
  registerStudioCatalogAdapters,
  type WorkerProviderBinding,
} from "../providers/registration";
import { ProviderRegistry } from "../providers/registry";
import { createLocalSpecReader, localSpecFor, type LocalSpecDocuments } from "../providers/spec-reader";
import { FAL_ADAPTER_NAME, FAL_ADAPTER_VERSION } from "../providers/fal-constants";
import { outputFamilyForTask } from "../providers/fal-outputs";
import { ProviderError } from "../providers/types";
import { createInProcessFixtureQueue, type LocalFixtureQueue } from "../fixture/fal-queue";
import {
  createFixtureDecoder,
  createFixtureScanner,
  createLocalDiskStore,
  createWorkerFetchPort,
  mediaKindForMime,
} from "../media/custody";
import { runIngestPipeline } from "../media/ingest";
import { createMemoryIngestAssets } from "../media/memory";
import type { FetchOncePort } from "../media/fetch-guard";
import type { IngestStoragePort } from "../media/ingest";
import { createMemoryEconomicsStore, MemoryEconomicsStore } from "../economics/memory";
import { createVersionedQuote } from "../economics/quotes";
import { parsePriceSentences } from "../economics/fal-price-parser";
import type { MeterUnit } from "../economics/types";
import { admitJob } from "./admission";
import { createMemoryRuntimeStore, MemoryRuntimeStore } from "./memory";
import { RuntimeError, type RuntimeAttempt, type RuntimeJob } from "./types";

export const FIXTURE_LANE_WORKER_ID = "fixture-lane";
/** Fixture funds/quota per scope (memory only — never real money). */
export const FIXTURE_FUND_ICU = 1_000_000;
const FIXTURE_MAX_CONCURRENT_JOBS = 10;
const ATTESTATION_CAP = 1000;

export type FixtureQualification = "FULL" | "PARTIAL" | "BLOCKED";

export interface FixtureQualificationEvidence {
  endpointId: string;
  specKnown: boolean;
  priceStatus: "VERIFIED" | "DERIVED" | "UNKNOWN";
  canary: "PASS" | "NOT_RUN";
  qualification: FixtureQualification;
  executable: boolean;
  reason: string;
}

export interface FixtureAttestation {
  endpointId: string;
  task: TaskName;
  at: string;
  operationId: string;
  outcome: "succeeded" | "failed" | "cancelled" | "reconciling";
  outputShape: string | null;
  usageMinor: number | null;
  priceVersion: string;
}

export interface FixtureLaneOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  newId?: () => string;
  storeDir?: string;
  fundIcu?: number;
  maxPolls?: number;
  hooks?: {
    onPoll?: (poll: number, job: RuntimeJob) => void | Promise<void>;
  };
}

export interface FixtureEstimateInput {
  scope: ProjectScope;
  task: TaskName;
  endpointId: string;
  priceVersion: string;
  meterQuantity: number;
  capIcu?: number;
  hardCap?: boolean;
  pins?: VersionPins;
}

export interface FixtureAdmitInput {
  scope: ProjectScope;
  task: TaskName;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  quoteId: string;
  pins: VersionPins;
  endpointId: string;
  parameters: Readonly<Record<string, unknown>>;
}

/** Mirror of the memory-catalog root probe (core cannot import app code). */
const STANDALONE_CATALOG = "lib/media/generated/fal-catalog.json";
const MONOREPO_CATALOG = "apps/studio/lib/media/generated/fal-catalog.json";

function laneRepoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, STANDALONE_CATALOG))) return cwd;
  if (existsSync(join(cwd, MONOREPO_CATALOG))) return cwd;
  return join(cwd, "..");
}

function laneCatalogRel(): string {
  if (existsSync(join(process.cwd(), STANDALONE_CATALOG))) return STANDALONE_CATALOG;
  return MONOREPO_CATALOG;
}

function sha16(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function scopeKey(scope: ProjectScope): string {
  return `${String(scope.tenantId)}:${String(scope.workspaceId)}:${String(scope.projectId)}`;
}

export interface FixtureGeneration {
  generationId: string;
  jobId: string;
  attemptId: string;
  versionIds: readonly string[];
}

interface LaneDocs {
  docs: LocalSpecDocuments;
  source: CatalogSourceEndpoint[];
  records: Map<string, { task: string; sentences: string[]; rawHash: string | null }>;
  specVersions: { adapterName: string; adapterVersion: string; priceVersion: string; catalogVersion: string };
}

async function loadLaneDocs(): Promise<LaneDocs> {
  const root = laneRepoRoot();
  const catalog = JSON.parse(
    readFileSync(join(root, laneCatalogRel()), "utf8"),
  ) as LocalCatalogJson;
  const snapshots: Record<string, SchemaSnapshotDoc> = {};
  const records = new Map<string, { task: string; sentences: string[]; rawHash: string | null }>();
  for (const record of catalog.records) {
    for (const endpoint of record.endpoints) {
      const pricing = endpoint.pricing as { sentences?: unknown; raw_hash?: unknown } | null;
      records.set(endpoint.endpoint_id, {
        task: endpoint.task,
        sentences: Array.isArray(pricing?.sentences) ? (pricing.sentences as string[]) : [],
        rawHash: typeof pricing?.raw_hash === "string" ? (pricing.raw_hash as string) : null,
      });
      const snapPath = endpoint.schema?.status === "supported" ? endpoint.schema.snapshot : null;
      if (snapPath && !(snapPath in snapshots) && existsSync(join(root, snapPath))) {
        snapshots[snapPath] = JSON.parse(readFileSync(join(root, snapPath), "utf8")) as SchemaSnapshotDoc;
      }
    }
  }
  const source = buildLocalSource(catalog, snapshots);
  const controls = new Map(
    source.map((row) => [row.endpointId, { requiredControls: row.requiredControls, supportedControls: row.supportedControls }]),
  );
  return {
    docs: { catalog, snapshots, controls },
    source,
    records,
    specVersions: {
      adapterName: FAL_ADAPTER_NAME,
      adapterVersion: FAL_ADAPTER_VERSION,
      priceVersion: DEFAULT_VERSION_PINS.priceVersion,
      catalogVersion: catalog.catalog_version,
    },
  };
}

export class FixtureLane {
  readonly runtime: MemoryRuntimeStore;
  readonly economics: MemoryEconomicsStore;
  readonly fixture: LocalFixtureQueue;
  readonly provider: WorkerProviderBinding;
  readonly operations: ProviderOperationStore;
  readonly fetchPort: FetchOncePort;
  readonly storage: IngestStoragePort;
  readonly assets: ReturnType<typeof createMemoryIngestAssets>;

  private readonly env: NodeJS.ProcessEnv;
  private readonly maxPolls: number;
  private readonly fundIcu: number;
  private readonly hooks: NonNullable<FixtureLaneOptions["hooks"]>;
  private readonly funded = new Set<string>();
  private docsPromise: Promise<LaneDocs> | null = null;
  private readonly attestations: FixtureAttestation[] = [];
  private readonly generations: FixtureGeneration[] = [];

  constructor(options: FixtureLaneOptions = {}) {
    this.env = options.env ?? process.env;
    this.maxPolls = options.maxPolls ?? 60;
    this.fundIcu = options.fundIcu ?? FIXTURE_FUND_ICU;
    this.hooks = options.hooks ?? {};
    this.runtime = createMemoryRuntimeStore({ now: options.now, newId: options.newId });
    this.economics = createMemoryEconomicsStore();
    let base = "";
    this.fixture = createInProcessFixtureQueue({ respond: (endpointId) => this.respondFor(endpointId, () => base) });
    base = this.fixture.baseUrl;
    const registry = new ProviderRegistry();
    this.operations = createMemoryOperationStore();
    registerStudioCatalogAdapters(registry, {
      fal: {
        fetchImpl: this.fixture.fetch,
        queueBaseUrl: this.fixture.baseUrl,
        getApiKey: () => "fixture-key",
        store: this.operations,
        resolveSpec: async (endpointId) => this.specFor(endpointId),
      },
    });
    this.provider = createWorkerProviderBinding(registry, {
      resolveSpec: async (endpointId) => this.specFor(endpointId),
    });
    this.fetchPort = createWorkerFetchPort(this.fixture.fetch);
    const rootDir =
      options.storeDir ?? (this.env.STUDIO_LOCAL_STORE_DIR?.trim() ? this.env.STUDIO_LOCAL_STORE_DIR.trim() : join(process.cwd(), ".studio-fixture-store"));
    this.storage = createLocalDiskStore(rootDir);
    this.assets = createMemoryIngestAssets();
  }

  private async laneDocs(): Promise<LaneDocs> {
    if (!this.docsPromise) {
      this.docsPromise = loadLaneDocs().then((loaded) => {
        this.docsCache = loaded;
        return loaded;
      });
    }
    return this.docsPromise;
  }

  private async specFor(endpointId: string): Promise<EndpointSpec | null> {
    const { docs, specVersions } = await this.laneDocs();
    return createLocalSpecReader(docs, specVersions).getSpec(endpointId);
  }

  private taskOf(records: LaneDocs["records"], endpointId: string): TaskName | null {
    const record = records.get(endpointId);
    if (!record) return null;
    return mapFalSlug(record.task).tasks[0] ?? null;
  }

  /** Per-task fixture result bytes + scripted usage minor (single unit). */
  private respondFor(endpointId: string, baseOf: () => string): unknown {
    // Sync by fixture contract: shape from the cached task map when
    // docs loaded, else the image default (docs load before any submit).
    const task = this.docsCache?.records ? this.taskOf(this.docsCache.records, endpointId) : null;
    const base = baseOf();
    const usage = { provider_minor: this.scriptedMinor(endpointId), meter_quantity: 1 };
    if (task === "video.generate" || task === "video.edit") {
      return { video: { url: `${base}/files/clip.mp4`, content_type: "video/mp4" }, usage };
    }
    if (task === "audio.generate" || task === "music.generate" || task === "speech.synthesize") {
      return { audio: { url: `${base}/files/clip.mp3`, content_type: "audio/mpeg" }, usage };
    }
    if (task === "mesh.generate") {
      return { model_mesh: { url: `${base}/files/model.glb`, content_type: "model/gltf-binary" }, usage };
    }
    return { images: [{ url: `${base}/files/img.png`, content_type: "image/png" }], usage };
  }

  private docsCache: LaneDocs | null = null;

  /** Scripted fixture minor in microdollars (DERIVED unit price × 1 unit). */
  private scriptedMinor(endpointId: string): number {
    const parsed = this.derivedPrice(endpointId);
    if (parsed) return parsed.unitPriceIcu * 1000;
    return 1000;
  }

  private derivedPrice(endpointId: string): { unitPriceIcu: number; meterUnit: MeterUnit } | null {
    const records = this.docsCache?.records;
    const record = records?.get(endpointId);
    if (!record || !record.rawHash || record.sentences.length === 0) return null;
    const parsed = parsePriceSentences({
      endpointId,
      taskName: this.taskOf(records!, endpointId) ?? record.task,
      sentences: record.sentences,
      evidenceHash: record.rawHash,
    });
    if (parsed.status !== "DERIVED") return null;
    return { unitPriceIcu: parsed.candidate.unitPriceIcu, meterUnit: parsed.candidate.meterUnit };
  }

  private async ensureScope(scope: ProjectScope): Promise<void> {
    const key = scopeKey(scope);
    if (this.funded.has(key)) return;
    this.economics.fund(scope, asIcu(this.fundIcu));
    this.economics.quotas.setPolicy({
      projectId: String(scope.projectId),
      maxConcurrentJobs: FIXTURE_MAX_CONCURRENT_JOBS,
      dailyIcu: asIcu(this.fundIcu),
      enforced: true,
    });
    this.funded.add(key);
  }

  private async ensurePrice(task: TaskName, endpointId: string, priceVersion: string): Promise<void> {
    const { records } = await this.laneDocs();
    const record = records.get(endpointId);
    if (!record || !record.rawHash || record.sentences.length === 0) return;
    const parsed = parsePriceSentences({
      endpointId,
      taskName: this.taskOf(records, endpointId) ?? record.task,
      sentences: record.sentences,
      evidenceHash: record.rawHash,
      priceVersion,
    });
    if (parsed.status !== "DERIVED") return;
    const candidate = parsed.candidate;
    this.economics.seedPrice({
      task,
      endpointId,
      priceVersion,
      meterUnit: candidate.meterUnit,
      unitPriceIcu: candidate.unitPriceIcu,
      minorPerIcu: candidate.minorPerIcu,
      skuRate: candidate.skuRate,
      effectiveAt: new Date().toISOString(),
      retiredAt: null,
    });
  }

  /**
   * Fixture qualification (M4 D8): FULL needs a VERIFIED price and a real
   * canary — neither exists on this lane, so the ceiling is PARTIAL, and
   * PARTIAL executes only with ETHEN_STUDIO_ALLOW_PARTIAL=1.
   */
  async qualify(endpointId: string): Promise<FixtureQualificationEvidence> {
    const { docs, specVersions } = await this.laneDocs();
    const spec = localSpecFor(docs, endpointId, specVersions);
    const derived = this.derivedPrice(endpointId);
    const specKnown = spec !== null;
    const priceStatus = derived ? "DERIVED" : "UNKNOWN";
    const canary = "NOT_RUN" as const;
    const allowPartial = this.env.ETHEN_STUDIO_ALLOW_PARTIAL === "1";
    if (!spec || !derived) {
      return {
        endpointId, specKnown, priceStatus, canary,
        qualification: "BLOCKED",
        executable: false,
        reason: !specKnown ? "no pinned spec for this endpoint." : "no DERIVED unit price for this endpoint.",
      };
    }
    if (allowPartial) {
      return {
        endpointId, specKnown, priceStatus, canary,
        qualification: "PARTIAL",
        executable: true,
        reason: "PARTIALLY_QUALIFIED fixture execution (DERIVED price, no canary).",
      };
    }
    return {
      endpointId, specKnown, priceStatus, canary,
      qualification: "PARTIAL",
      executable: false,
      reason: "PARTIALLY_QUALIFIED endpoints execute in dev only with ETHEN_STUDIO_ALLOW_PARTIAL=1.",
    };
  }

  async estimate(input: FixtureEstimateInput) {
    await this.ensureScope(input.scope);
    await this.ensurePrice(input.task, input.endpointId, input.priceVersion);
    return createVersionedQuote(this.economics, this.economics, {
      task: input.task,
      scope: input.scope,
      pins: input.pins ?? { ...DEFAULT_VERSION_PINS, priceVersion: input.priceVersion },
      endpointId: input.endpointId,
      priceVersion: input.priceVersion,
      meterQuantity: input.meterQuantity,
      capIcu: input.capIcu === undefined ? undefined : asIcu(input.capIcu),
      hardCap: input.hardCap,
    });
  }

  async admit(input: FixtureAdmitInput) {
    const evidence = await this.qualify(input.endpointId);
    if (!evidence.executable) {
      throw new RuntimeError("ADMISSION_CLOSED", `Fixture admission closed for ${input.endpointId}: ${evidence.reason}`);
    }
    await this.ensureScope(input.scope);
    return admitJob(
      {
        scope: input.scope,
        task: input.task,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        quoteId: input.quoteId,
        pins: input.pins,
        endpointId: input.endpointId,
        parameters: input.parameters,
      },
      { runtime: this.runtime, economics: this.economics },
    );
  }

  async get(jobId: string, scope: ProjectScope): Promise<RuntimeJob | null> {
    return this.runtime.get(jobId, scope);
  }

  async listAttempts(jobId: string, scope: ProjectScope): Promise<readonly RuntimeAttempt[]> {
    return this.runtime.listAttempts(jobId, scope);
  }

  /**
   * Fixture round-trip sweep (M4 D8): submit → poll → outputs for every
   * candidate endpoint, recording one attestation each. Fails loud on
   * the first unresolvable spec or empty result — a candidate that
   * cannot round-trip is a real gap, never a skipped row.
   */
  async sweepCandidates(buildParams: (spec: EndpointSpec) => Record<string, unknown>): Promise<FixtureAttestation[]> {
    const { source } = await this.laneDocs();
    const swept: FixtureAttestation[] = [];
    let index = 0;
    for (const row of source) {
      if (row.tasks.length === 0 || !row.schemaKnown) continue;
      const spec = await this.specFor(row.endpointId);
      if (!spec) {
        throw new RuntimeError("NOT_FOUND", `Fixture sweep: candidate ${row.endpointId} lost its spec.`);
      }
      const key = `sweep:${index}:${row.endpointId}`;
      const operationId = await this.provider.submit(key, {
        endpointId: row.endpointId,
        task: spec.task,
        parameters: buildParams(spec),
        jobId: "sweep-job",
        attemptId: `sweep-att-${index}`,
      });
      index += 1;
      await this.provider.query(operationId);
      const state = await this.provider.query(operationId);
      if (state !== "SUCCEEDED") {
        throw new RuntimeError("INTERNAL", `Fixture sweep: ${row.endpointId} polled ${state}.`);
      }
      const outputs = await this.provider.retrieveOutputs(operationId);
      if (outputs.length === 0) {
        throw new RuntimeError("INTERNAL", `Fixture sweep: ${row.endpointId} returned no outputs.`);
      }
      const usage = await this.provider.reportUsage(operationId);
      const entry: FixtureAttestation = {
        endpointId: row.endpointId,
        task: spec.task,
        at: new Date().toISOString(),
        operationId,
        outcome: "succeeded",
        outputShape: outputFamilyForTask(spec.task),
        usageMinor: usage.providerMinor,
        priceVersion: spec.priceVersion,
      };
      this.attest(entry);
      swept.push(entry);
    }
    return swept;
  }

  getAttestations(): readonly FixtureAttestation[] {
    return [...this.attestations];
  }

  listGenerations(): readonly FixtureGeneration[] {
    return [...this.generations];
  }

  /** Cooperative cancel: boundaries terminalize; unclaimed jobs close now. */
  async cancel(scope: ProjectScope, jobId: string, reason: string): Promise<RuntimeJob> {
    const job = await this.runtime.requestCancel(jobId, scope, reason);
    if (job.status === "CANCEL_REQUESTED") {
      const attempt = (await this.runtime.listAttempts(jobId, scope)).at(-1) ?? null;
      if (!attempt) {
        // Never dispatched: close immediately and release the hold.
        await this.economics.release({ scope, idempotencyKey: job.idempotencyKey, reason }).catch(() => null);
        return this.runtime.forceTransition(jobId, scope, "CANCELLED");
      }
    }
    if (job.status === "CANCELLED") {
      await this.economics.release({ scope, idempotencyKey: job.idempotencyKey, reason }).catch(() => null);
      return job;
    }
    return job;
  }

  /**
   * Drain every QUEUED job in scope through the workflow phases
   * (claim → submit → poll → ingest → settle), like a real worker.
   * Total: every driven job terminalizes; nothing throws past here.
   * Each job is driven at most once per call: fresh claims arrive
   * RUNNING (driven) while RECONCILING re-claims keep their status and
   * are left for the operator (reconcile-before-retry is never
   * automatic). Note: an oldest unprocessable job stops the drain, so
   * younger QUEUED jobs behind it wait for operator resolution.
   */
  async drainScope(scope: ProjectScope): Promise<string[]> {
    const executed: string[] = [];
    const seen = new Set<string>();
    for (;;) {
      const claim = await this.runtime.claimLease(scope, FIXTURE_LANE_WORKER_ID, 300);
      if (!claim || seen.has(claim.job.jobId)) return executed;
      seen.add(claim.job.jobId);
      if (claim.job.status !== "RUNNING") continue;
      executed.push(claim.job.jobId);
      await this.runClaimed(scope, claim.job, claim.generation);
    }
  }

  private attest(entry: FixtureAttestation): void {
    this.attestations.push(entry);
    if (this.attestations.length > ATTESTATION_CAP) this.attestations.splice(0, this.attestations.length - ATTESTATION_CAP);
  }

  private async refresh(scope: ProjectScope, jobId: string): Promise<RuntimeJob> {
    const job = await this.runtime.get(jobId, scope);
    if (!job) throw new RuntimeError("NOT_FOUND", `Fixture job ${jobId} vanished mid-run.`);
    return job;
  }

  private async runClaimed(scope: ProjectScope, claimed: RuntimeJob, generation: number): Promise<void> {
    const jobId = claimed.jobId;
    let attempt: RuntimeAttempt | null = null;
    let operationId: string | null = null;
    const shape: string | null = outputFamilyForTask(claimed.task);
    const fail = async (error: unknown): Promise<void> => {
      const message = error instanceof Error ? error.message : String(error);
      await this.economics.release({ scope, idempotencyKey: claimed.idempotencyKey, reason: message.slice(0, 200) }).catch(() => null);
      if (attempt) {
        await this.runtime.updateAttempt(attempt.attemptId, scope, { status: "FAILED", lastError: message.slice(0, 500) }).catch(() => null);
      }
      await this.runtime.forceTransition(jobId, scope, "FAILED").catch(() => null);
      this.attest({
        endpointId: claimed.endpointId, task: claimed.task, at: new Date().toISOString(),
        operationId: operationId ?? "none", outcome: "failed", outputShape: shape,
        usageMinor: null, priceVersion: claimed.pins.priceVersion,
      });
    };
    try {
      attempt = await this.runtime.startAttempt(jobId, scope, FIXTURE_LANE_WORKER_ID, generation);
      try {
        operationId = await this.provider.submit(attempt.operationKey, {
          endpointId: claimed.endpointId,
          task: claimed.task,
          parameters: claimed.parameters,
          jobId,
          attemptId: attempt.attemptId,
        });
      } catch (error) {
        if (error instanceof ProviderError && error.code === "DISPATCH_UNCERTAIN") {
          await this.runtime.markSubmitAmbiguous(attempt.attemptId, scope, error.message.slice(0, 500));
          await this.runtime.forceTransition(jobId, scope, "RECONCILING");
          this.attest({
            endpointId: claimed.endpointId, task: claimed.task, at: new Date().toISOString(),
            operationId: "uncertain", outcome: "reconciling", outputShape: shape,
            usageMinor: null, priceVersion: claimed.pins.priceVersion,
          });
          return;
        }
        throw error;
      }
      const operation = await this.runtime.recordOperation({
        jobId, attemptId: attempt.attemptId, scope, providerOperationId: operationId, state: "SUBMITTED",
      });
      await this.runtime.updateAttempt(attempt.attemptId, scope, { providerOperationId: operationId, phase: "poll" });

      let poll = 0;
      let terminal: "SUCCEEDED" | "FAILED" | "CANCELED" | "UNKNOWN" | "STUCK" = "STUCK";
      for (poll = 1; poll <= this.maxPolls; poll += 1) {
        const fresh = await this.refresh(scope, jobId);
        if (fresh.status === "CANCEL_REQUESTED" || fresh.status === "CANCELLED") {
          await this.provider.cancel(operationId).catch(() => false);
          await this.economics.release({ scope, idempotencyKey: claimed.idempotencyKey, reason: fresh.cancelReason ?? "cancelled" }).catch(() => null);
          await this.runtime.updateAttempt(attempt.attemptId, scope, { status: "CANCELLED" }).catch(() => null);
          await this.runtime.forceTransition(jobId, scope, "CANCELLED").catch(() => null);
          this.attest({
            endpointId: claimed.endpointId, task: claimed.task, at: new Date().toISOString(),
            operationId, outcome: "cancelled", outputShape: shape,
            usageMinor: null, priceVersion: claimed.pins.priceVersion,
          });
          return;
        }
        const state = await this.provider.query(operationId);
        await this.runtime.updateOperation(operation.operationId, scope, state);
        await this.hooks.onPoll?.(poll, fresh);
        if (state === "SUCCEEDED" || state === "FAILED" || state === "CANCELED" || state === "UNKNOWN") {
          terminal = state;
          break;
        }
      }
      if (terminal === "FAILED" || terminal === "CANCELED") {
        await this.economics.release({ scope, idempotencyKey: claimed.idempotencyKey, reason: `provider ${terminal.toLowerCase()}` }).catch(() => null);
        await this.runtime.updateAttempt(attempt.attemptId, scope, { status: "FAILED" }).catch(() => null);
        await this.runtime.forceTransition(jobId, scope, "FAILED");
        this.attest({
          endpointId: claimed.endpointId, task: claimed.task, at: new Date().toISOString(),
          operationId, outcome: "failed", outputShape: shape,
          usageMinor: null, priceVersion: claimed.pins.priceVersion,
        });
        return;
      }
      if (terminal === "UNKNOWN" || terminal === "STUCK") {
        await this.runtime.forceTransition(jobId, scope, "RECONCILING");
        this.attest({
          endpointId: claimed.endpointId, task: claimed.task, at: new Date().toISOString(),
          operationId, outcome: "reconciling", outputShape: shape,
          usageMinor: null, priceVersion: claimed.pins.priceVersion,
        });
        return;
      }

      await this.runtime.forceTransition(jobId, scope, "OUTPUT_READY");
      const outputs = await this.provider.retrieveOutputs(operationId);
      const preIngest = await this.refresh(scope, jobId);
      if (preIngest.status === "CANCEL_REQUESTED" || preIngest.status === "CANCELLED") {
        await this.economics.release({ scope, idempotencyKey: claimed.idempotencyKey, reason: preIngest.cancelReason ?? "cancelled" }).catch(() => null);
        await this.runtime.updateAttempt(attempt.attemptId, scope, { status: "CANCELLED" }).catch(() => null);
        await this.runtime.forceTransition(jobId, scope, "CANCELLED").catch(() => null);
        this.attest({
          endpointId: claimed.endpointId, task: claimed.task, at: new Date().toISOString(),
          operationId, outcome: "cancelled", outputShape: shape,
          usageMinor: null, priceVersion: claimed.pins.priceVersion,
        });
        return;
      }
      await this.runtime.forceTransition(jobId, scope, "INGESTING");
      await this.runtime.updateAttempt(attempt.attemptId, scope, { phase: "ingest" });
      const versionIds: string[] = [];
      for (const output of outputs) {
        const outcome = await runIngestPipeline(
          { fetch: this.fetchPort, scan: createFixtureScanner(), decode: createFixtureDecoder(), assets: this.assets, storage: this.storage },
          {
            scope,
            descriptor: {
              sourceUrl: output.providerUrl,
              expiresAt: output.expiresAt,
              expectedSha256: null,
              expectedByteSize: output.byteSize,
              mediaType: mediaKindForMime(output.mediaType),
              mimeType: output.mediaType,
              idempotencyKey: `ingest:${jobId}:${sha16(output.providerUrl)}`,
            },
            assetId: null,
            origin: `provider-ingest:${jobId}`,
            allowInsecureLoopback: true,
          },
        );
        versionIds.push(`${outcome.assetId}:v${outcome.version}`);
      }
      const linked = await this.runtime.linkGeneration({ jobId, attemptId: attempt.attemptId, scope, assetVersionIds: versionIds, quarantined: false, quarantineReason: null });
      this.generations.push({ generationId: linked.generationId, jobId, attemptId: attempt.attemptId, versionIds: [...versionIds] });
      await this.runtime.forceTransition(jobId, scope, "SETTLING");
      await this.runtime.updateAttempt(attempt.attemptId, scope, { phase: "settle" });

      const usage = await this.provider.reportUsage(operationId);
      const quote = await this.economics.get(scope, claimed.quoteId);
      if (!quote) throw new RuntimeError("NOT_FOUND", `Fixture quote ${claimed.quoteId} is missing.`);
      const settled = await this.economics.settle({
        scope,
        idempotencyKey: claimed.idempotencyKey,
        actualIcu: quote.estimatedCostIcu,
        usage: {
          // The queue meters per request; quantity actuals are the
          // admitted quantity and minor actuals are the reported minor
          // (scripted by the fixture, null from the real queue).
          meterUnit: "task_unit" satisfies MeterUnit,
          quantity: quote.meterQuantity,
          providerMinor: usage.providerMinor,
          providerEvidenceHash: null,
        },
        providerId: "fal",
        minorPerIcu: usage.minorPerIcu,
      });
      if (settled.state === "reconciling") {
        await this.runtime.forceTransition(jobId, scope, "RECONCILING");
        this.attest({
          endpointId: claimed.endpointId, task: claimed.task, at: new Date().toISOString(),
          operationId, outcome: "reconciling", outputShape: shape,
          usageMinor: usage.providerMinor, priceVersion: claimed.pins.priceVersion,
        });
        return;
      }
      await this.runtime.updateAttempt(attempt.attemptId, scope, { status: "COMPLETED" });
      await this.runtime.forceTransition(jobId, scope, "COMPLETED");
      this.attest({
        endpointId: claimed.endpointId, task: claimed.task, at: new Date().toISOString(),
        operationId, outcome: "succeeded", outputShape: shape,
        usageMinor: usage.providerMinor, priceVersion: claimed.pins.priceVersion,
      });
    } catch (error) {
      await fail(error);
    }
  }
}

let shared: FixtureLane | null = null;

/** Process-shared lane for routes (dev server memory). */
export function getFixtureLane(): FixtureLane {
  if (!shared) shared = new FixtureLane({ env: process.env });
  return shared;
}

/** Test-only: drop the shared lane. */
export function resetFixtureLane(): void {
  shared = null;
}
