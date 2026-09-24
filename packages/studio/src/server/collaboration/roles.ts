/**
 * Studio V5 collaboration — role mapping over Platform membership (STUDIO_18).
 *
 * Membership authority remains Platform (project_members roles). Studio
 * maps: owner/admin -> admin, member -> creator, viewer -> viewer; a
 * reviewer grant (j18 mapping row) lifts a member to reviewer. There is
 * no separate organization silo: remove the Platform membership and every
 * Studio capability falls away with it.
 */
import "server-only";
import { collaborationError } from "./types";
import type { CollaborationCapability, PlatformRole, StudioRole } from "./types";

const PLATFORM_ROLES: readonly PlatformRole[] = ["owner", "admin", "member", "viewer"];

/** Map a Platform role (+ optional reviewer grant) to a Studio role. */
export function mapPlatformRole(platformRole: PlatformRole, reviewerGrant: boolean): StudioRole {
  if (!PLATFORM_ROLES.includes(platformRole)) {
    throw collaborationError("BAD_REQUEST", `Unknown platform role: ${String(platformRole)}.`);
  }
  if (platformRole === "owner" || platformRole === "admin") return "admin";
  if (platformRole === "viewer") return "viewer";
  return reviewerGrant ? "reviewer" : "creator";
}

const ROLE_CAPABILITIES: Readonly<Record<StudioRole, readonly CollaborationCapability[]>> = {
  viewer: ["libraries.read", "jobs.read", "notifications.read"],
  creator: [
    "libraries.read",
    "jobs.read",
    "jobs.retry",
    "jobs.cancel",
    "review.request",
    "review.comment",
    "notifications.read",
  ],
  reviewer: [
    "libraries.read",
    "jobs.read",
    "jobs.retry",
    "jobs.cancel",
    "review.request",
    "review.decide",
    "review.comment",
    "notifications.read",
  ],
  admin: [
    "libraries.read",
    "jobs.read",
    "jobs.retry",
    "jobs.cancel",
    "review.request",
    "review.decide",
    "review.comment",
    "links.manage",
    "reviewers.manage",
    "notifications.read",
  ],
};

/** Capabilities granted to a Studio role. */
export function capabilitiesFor(role: StudioRole): readonly CollaborationCapability[] {
  const capabilities = ROLE_CAPABILITIES[role];
  if (!capabilities) throw collaborationError("BAD_REQUEST", `Unknown studio role: ${String(role)}.`);
  return capabilities;
}

/** True when the role carries the capability. */
export function can(role: StudioRole, capability: CollaborationCapability): boolean {
  return capabilitiesFor(role).includes(capability);
}

/** Throw FORBIDDEN unless the role carries the capability. */
export function assertCapability(role: StudioRole, capability: CollaborationCapability): void {
  if (!can(role, capability)) {
    throw collaborationError("FORBIDDEN", `${role} cannot ${capability}.`, { role, capability });
  }
}

/** Human label for a Studio role (UI surfaces). */
export function roleLabel(role: StudioRole): string {
  switch (role) {
    case "viewer":
      return "Viewer";
    case "creator":
      return "Creator";
    case "reviewer":
      return "Reviewer";
    case "admin":
      return "Admin";
  }
}
