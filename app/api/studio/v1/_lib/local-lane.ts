import "server-only";

/**
 * P03 — gated local fixture lane (shared infrastructure, RC-3/RC-10).
 *
 * Memory stores are reachable ONLY when both gates hold:
 *   1. the request is the loopback Studio inspection lane, and
 *   2. `STUDIO_LOCAL_RUNTIME=fixture`.
 *
 * Either gate alone keeps every route on its Supabase path (which maps
 * a missing client to 503 `SETUP_REQUIRED`). `localStores()` is the only
 * place later jobs (P04, P05) get local stores — routes must not create
 * per-route module-private stores. The registry lives on `globalThis`
 * so it survives dev HMR, and is seeded with the synthetic local tenant
 * and project plus the local owner membership.
 */
import {
  STUDIO_LOCAL_USER_ID,
  isStudioLocalRequest,
} from "@/lib/studio-local-project";
import {
  createMemoryCollaboration,
  type MemoryCollaborationSeed,
} from "@ethen/studio-core/server/collaboration";
import {
  createMemoryDerivativeStore,
  createMemoryExportStore,
  createMemoryProcessStore,
  type MemoryDerivativeStore,
  type MemoryExportStore,
  type MemoryProcessStore,
} from "@ethen/studio-core/server/media";
import {
  MemoryCinemaStore,
  MemoryRenderStore,
  MemoryTimelineStore,
  type CinemaSequence,
} from "@ethen/studio-core/server/workbench";
import {
  createMemoryCompositeStore,
  seedCompositeTemplates,
  type MemoryCompositeStore,
} from "@ethen/studio-core/server/composites";
import {
  createMemoryRealtimeStore,
  type MemoryRealtimeStore,
} from "@ethen/studio-core/server/realtime";
import { MemoryAudioStore } from "@ethen/studio-core/server/audio";
import { MemoryAgentStore } from "@ethen/studio-core/server/agent";
import { MemoryWorkflowVersionStore } from "@ethen/studio-core/server/workflow";

export type LocalCollaborationStores = ReturnType<typeof createMemoryCollaboration>;

export interface LocalMediaStores {
  exports: MemoryExportStore;
  processes: MemoryProcessStore;
  derivatives: MemoryDerivativeStore;
  /** Creation order for export listing (the store has get-by-id only). */
  exportOrder: Array<{ scopeKey: string; exportId: string }>;
  /** Worker lifecycle per export id (fixture lane has no worker). */
  lifecycles: Map<string, string>;
}

export interface LocalLaneKeys {
  /** First-write-wins review id per (scope, idempotency key). */
  reviews: Map<string, string>;
  /** First-write-wins link id per (scope, idempotency key). */
  links: Map<string, string>;
  /** First-write-wins campaign id per (scope, idempotency key). */
  campaigns: Map<string, string>;
  /** Seen realtime session idempotency keys per scope (duplicates conflict). */
  realtimeSessions: Map<string, string>;
  /** Idempotency key per realtime session id (row projection). */
  realtimeSessionKeys: Map<string, string>;
  /** First-write-wins agent run id per (scope, idempotency key). */
  agentRuns: Map<string, string>;
  /**
   * P07 RD-01 — staged asset ids per (scope, fixture job id). The fixture
   * ingest pipeline writes custody into the lane's own memory stores;
   * this index makes the bridge into the canonical local asset lane
   * idempotent (replay reuses it; missing rows self-heal).
   */
  fixtureStagedJobs: Map<string, string[]>;
}

export interface LocalWorkbenchStores {
  timelines: MemoryTimelineStore;
  renders: MemoryRenderStore;
  cinema: MemoryCinemaStore;
  /** Sequence index (the kernel store holds scenes/shots/takes only). */
  cinemaSequences: Map<string, CinemaSequence>;
  /** Creation order for sequence listing (newest first at read). */
  cinemaOrder: string[];
}

export interface LocalWorkflowStores {
  /** Append-only graph revisions + compiled DAGs (untouched kernel store). */
  versions: MemoryWorkflowVersionStore;
  /** Project scope key per graph id (the kernel store is scope-blind). */
  scopes: Map<string, string>;
  /** Compiled dag hash per (graphId, revision) (the kernel keys DAGs by hash). */
  dagByRevision: Map<string, string>;
  /** Frozen Workflow→App definitions by app id. */
  apps: Map<string, import("@ethen/studio-core/contracts").WorkflowAppDefinition>;
}

export interface LocalStores {
  collaboration: LocalCollaborationStores;
  media: LocalMediaStores;
  workbench: LocalWorkbenchStores;
  composites: MemoryCompositeStore;
  realtime: MemoryRealtimeStore;
  audio: MemoryAudioStore;
  workflow: LocalWorkflowStores;
  agent: MemoryAgentStore;
  keys: LocalLaneKeys;
}

const REGISTRY_KEY = "__ethenStudioLocalStores";

function seedCollaboration(): MemoryCollaborationSeed {
  return {
    memberships: new Map([[STUDIO_LOCAL_USER_ID, "owner"]]),
    reviewerGrants: [STUDIO_LOCAL_USER_ID],
  };
}

/** Pure gate truth table (unit-tested): BOTH gates must hold. */
export function shouldUseFixtureStores(input: { localRequest: boolean; runtime: string | undefined }): boolean {
  return input.localRequest === true && input.runtime === "fixture";
}

export function isFixtureRuntimeEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.STUDIO_LOCAL_RUNTIME === "fixture";
}

/** True only on the loopback lane with `STUDIO_LOCAL_RUNTIME=fixture`. */
export async function isStudioFixtureLane(_request?: unknown): Promise<boolean> {
  void _request;
  return shouldUseFixtureStores({ localRequest: await isStudioLocalRequest(), runtime: process.env.STUDIO_LOCAL_RUNTIME });
}

export function localStores(): LocalStores {
  const holder = globalThis as typeof globalThis & { [REGISTRY_KEY]?: LocalStores };
  if (!holder[REGISTRY_KEY]) {
    // P04: composites start with the kernel's frozen template seeds so
    // campaign create (which must bind a template version) works locally.
    const composites = createMemoryCompositeStore();
    for (const template of seedCompositeTemplates(new Date().toISOString())) {
      composites.putTemplate(template);
    }
    holder[REGISTRY_KEY] = {
      collaboration: createMemoryCollaboration(seedCollaboration()),
      media: {
        exports: createMemoryExportStore(),
        processes: createMemoryProcessStore(),
        derivatives: createMemoryDerivativeStore(),
        exportOrder: [],
        lifecycles: new Map(),
      },
      workbench: {
        timelines: new MemoryTimelineStore(),
        renders: new MemoryRenderStore(),
        cinema: new MemoryCinemaStore(),
        cinemaSequences: new Map(),
        cinemaOrder: [],
      },
      composites,
      realtime: createMemoryRealtimeStore(),
      audio: new MemoryAudioStore(),
      workflow: { versions: new MemoryWorkflowVersionStore(), scopes: new Map(), dagByRevision: new Map(), apps: new Map() },
      agent: new MemoryAgentStore(),
      keys: { reviews: new Map(), links: new Map(), campaigns: new Map(), realtimeSessions: new Map(), realtimeSessionKeys: new Map(), agentRuns: new Map(), fixtureStagedJobs: new Map() },
    };
  }
  return holder[REGISTRY_KEY];
}

/** Test hook: drop the process registry so the next read starts empty. */
export function resetLocalStores(): void {
  const holder = globalThis as typeof globalThis & { [REGISTRY_KEY]?: LocalStores };
  delete holder[REGISTRY_KEY];
}
