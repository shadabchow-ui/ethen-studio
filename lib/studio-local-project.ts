import "server-only";

import {
  isStudioLocalRequest,
  STUDIO_LOCAL_PROJECT_ID,
  STUDIO_LOCAL_TENANT_ID,
  STUDIO_LOCAL_USER_ID,
  STUDIO_LOCAL_WORKSPACE_ID,
  listStudioLocalProjects,
  createStudioLocalProject,
  hasStudioLocalProject,
} from "@ethen/ai/platform/auth/studio-local";

export { isStudioLocalRequest, STUDIO_LOCAL_PROJECT_ID, STUDIO_LOCAL_TENANT_ID, STUDIO_LOCAL_USER_ID, STUDIO_LOCAL_WORKSPACE_ID, listStudioLocalProjects, createStudioLocalProject, hasStudioLocalProject };

export function localProject(source = listStudioLocalProjects()[0]) {
  return {
    id: source.id,
    projectId: source.id,
    tenantId: STUDIO_LOCAL_TENANT_ID,
    workspaceId: STUDIO_LOCAL_WORKSPACE_ID,
    name: source.name,
    slug: source.id === STUDIO_LOCAL_PROJECT_ID ? "local-studio-project" : null,
    status: "active",
    role: "owner" as const,
    provisioned: true,
    revision: 1,
    isDefault: true,
    createdAt: source.createdAt,
    counts: { briefs: 0, deliverables: 0, directionSpecs: 0, assets: 0, decisionLocks: 0 },
  };
}
