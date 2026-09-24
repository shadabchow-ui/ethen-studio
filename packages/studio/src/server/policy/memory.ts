/** Studio V5 policy — memory store wiring + kernel port adapter (STUDIO_03). */
import "server-only";
import type { PolicyPort } from "../ports/operations";
import type { TaskName } from "../../contracts/tasks";
import type { PolicyAction } from "../../contracts/policy";
import type { ProjectScope } from "../../contracts/scope";
import { MemoryAuthorityRepository, MemoryDeliveryGrantStore } from "./authority";
import { MemoryConsentRepository } from "./consent";
import { evaluatePolicy, type PolicyStores } from "./decisions";
import { MemoryReviewLinkStore } from "./review-links";
import { MemoryRightsRepository } from "./rights";
import type {
  ContentReviewInput,
  PolicyAssetClass,
  PolicyRequest,
  SpendApprovalInput,
  StudioRole,
} from "./types";

export interface MemoryPolicyStore extends PolicyStores {
  deliveries: MemoryDeliveryGrantStore;
}

/** Test/local store. Production binds Supabase-backed adapters instead. */
export function createMemoryPolicyStore(): MemoryPolicyStore {
  return {
    consents: new MemoryConsentRepository(),
    rights: new MemoryRightsRepository(),
    authorities: new MemoryAuthorityRepository(),
    reviewLinks: new MemoryReviewLinkStore(),
    deliveries: new MemoryDeliveryGrantStore(),
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) return null;
  return [...value];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRoles(value: unknown): StudioRole[] {
  const roles = asStringArray(value) ?? [];
  const known: readonly StudioRole[] = ["viewer", "creator", "reviewer", "admin"];
  return roles.filter((r): r is StudioRole => (known as readonly string[]).includes(r));
}

/** Adapt rich policy stores to the minimal kernel PolicyPort. */
export function adaptPolicyPort(stores: PolicyStores): PolicyPort {
  return {
    decide: async (scope: ProjectScope, task: TaskName, action: PolicyAction, input) => {
      const source = (input ?? {}) as Record<string, unknown>;
      const destination = (source.destination ?? null) as Record<string, unknown> | null;
      const review = (source.contentReview ?? null) as Record<string, unknown> | null;
      const spend = (source.spendApproval ?? null) as Record<string, unknown> | null;
      const contentReview: ContentReviewInput | null = review
        ? {
            state: (asString(review.state) ?? "none") as ContentReviewInput["state"],
            pinnedVersion: asString(review.pinnedVersion),
            currentVersion: asString(review.currentVersion),
          }
        : null;
      const spendApproval: SpendApprovalInput | null = spend
        ? {
            approved: spend.approved === true,
            approvalId: asString(spend.approvalId),
            capIcu: asNumber(spend.capIcu),
          }
        : null;
      const request: PolicyRequest = {
        scope,
        actor: {
          actorId: asString(source.actorId) ?? "unknown",
          roles: asRoles(source.roles),
        },
        task,
        action,
        identityId: asString(source.identityId),
        identityVersion: asNumber(source.identityVersion),
        assetId: asString(source.assetId),
        assetVersion: asNumber(source.assetVersion),
        assetClass: (asString(source.assetClass) ?? null) as PolicyAssetClass | null,
        destination: destination
          ? {
              channel: asString(destination.channel),
              region: asString(destination.region),
              reviewTokenHash: asString(destination.reviewTokenHash),
            }
          : null,
        contentReview,
        spendApproval,
        now: asString(source.now) ?? undefined,
      };
      const evaluation = await evaluatePolicy(stores, request);
      return evaluation.decision;
    },
  };
}
