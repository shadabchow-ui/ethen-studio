/**
 * Studio V5 rights-scoped node cache identity (STUDIO_12).
 * Recovered from canvas-workflow cache semantics: identity binds scope,
 * input hashes, task/schema/adapter/endpoint versions, normalized
 * parameters, identity version and policy-relevant versions. Cross-user
 * cache is off: the actor is part of the identity. Reused output must
 * still recheck rights/retention at use (done by j13 execution).
 */
import { createHash } from "node:crypto";
import type { VersionPins } from "../../../contracts/versions";
import type { WorkflowNode } from "../../../contracts/workflow";
import { canonicalJson } from "./canonical";

export interface NodeCacheIdentity {
  scope: { tenantId: string; workspaceId: string; projectId: string; actorId: string };
  dagHash: string;
  nodeId: string;
  task: string;
  pins: VersionPins;
  endpointId: string;
  inputsHash: string;
  parametersHash: string;
  identityVersion: string | null;
  policyProfile: string;
  consentIds: readonly string[];
  rightsSnapshotId: string | null;
  codeVersion: string;
}

export const WORKFLOW_CACHE_CODE_VERSION = "studio-v5-canvas-1" as const;

export interface CacheIdentityInput {
  scope: { tenantId: string; workspaceId: string; projectId: string; actorId: string };
  dagHash: string;
  node: WorkflowNode;
  /** Upstream node ids feeding this node, any order (sorted internally). */
  upstreamNodeIds: readonly string[];
  /** Upstream output hashes feeding this node, any order. */
  upstreamOutputHashes: readonly string[];
  identityVersion: string | null;
  consentIds: readonly string[];
  rightsSnapshotId: string | null;
}

export function buildNodeCacheIdentity(input: CacheIdentityInput): NodeCacheIdentity {
  if (!input.scope.actorId?.trim()) {
    throw new Error("CACHE_IDENTITY: actor scope is required (cross-user cache is off).");
  }
  return {
    scope: { ...input.scope },
    dagHash: input.dagHash,
    nodeId: input.node.nodeId,
    task: input.node.task,
    pins: { ...input.node.pins },
    endpointId: input.node.endpointId,
    inputsHash: createHash("sha256")
      .update(
        canonicalJson({
          upstream: [...input.upstreamNodeIds].sort(),
          outputs: [...input.upstreamOutputHashes].sort(),
        }),
      )
      .digest("hex"),
    parametersHash: createHash("sha256").update(canonicalJson(input.node.parameters)).digest("hex"),
    identityVersion: input.identityVersion,
    policyProfile: input.node.policyProfile,
    consentIds: [...input.consentIds].sort(),
    rightsSnapshotId: input.rightsSnapshotId,
    codeVersion: WORKFLOW_CACHE_CODE_VERSION,
  };
}

/** Deterministic cache key for a node identity. */
export function nodeCacheKey(identity: NodeCacheIdentity): string {
  return createHash("sha256").update(canonicalJson(identity)).digest("hex");
}
