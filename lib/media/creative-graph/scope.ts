import "server-only";

import { createServiceClient } from "@ethen/database/service";
import type { StudioPersistenceScope } from "../persistence/studio-repository";
import { hasStudioLocalProject, isStudioLocalRequest, STUDIO_LOCAL_USER_ID } from "@/lib/studio-local-project";

/**
 * Studio V2 Job 01 — canonical graph scope.
 *
 * Call only after requireProject has authorized (actor × project). There is
 * no organization model yet, so organizationId is derived deterministically
 * from the Platform project's owner (one partition per owner). project_id
 * remains the real isolation boundary in every query and RLS policy.
 */
export async function resolveGraphScope(actorId: string, projectId: string): Promise<StudioPersistenceScope> {
  if (!actorId?.trim() || !projectId?.trim()) throw new Error("STUDIO_SCOPE_REQUIRED: actorId and projectId are required.");
  if (await isStudioLocalRequest()) {
    if (actorId !== STUDIO_LOCAL_USER_ID || !hasStudioLocalProject(projectId)) {
      throw new Error("STUDIO_SCOPE_REQUIRED: local project is not accessible.");
    }
    return { organizationId: `user:${STUDIO_LOCAL_USER_ID}`, projectId, actorId };
  }
  const client = createServiceClient();
  if (!client) throw new Error("Studio graph scope requires a configured service client.");
  const { data, error } = await client.from("projects").select("id,owner_user_id").eq("id", projectId).maybeSingle();
  if (error) throw new Error(`Studio graph scope lookup failed: ${error.message}`);
  if (!data) throw new Error("STUDIO_SCOPE_REQUIRED: unknown Platform project.");
  const owner = (data as { owner_user_id?: string }).owner_user_id;
  return { organizationId: `user:${owner ?? actorId}`, projectId, actorId };
}
