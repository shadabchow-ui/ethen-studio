/** Studio V5 kernel — scope identifiers: tenant/org → workspace → project. */

export type TenantId = string & { readonly __brand: "TenantId" };
export type WorkspaceId = string & { readonly __brand: "WorkspaceId" };
export type ProjectId = string & { readonly __brand: "ProjectId" };

function asBranded<T>(value: string, label: string): T {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value as T;
}

export function asTenantId(value: string): TenantId {
  return asBranded<TenantId>(value, "TenantId");
}
export function asWorkspaceId(value: string): WorkspaceId {
  return asBranded<WorkspaceId>(value, "WorkspaceId");
}
export function asProjectId(value: string): ProjectId {
  return asBranded<ProjectId>(value, "ProjectId");
}

export interface ProjectScope {
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  projectId: ProjectId;
}

export function buildScope(tenantId: string, workspaceId: string, projectId: string): ProjectScope {
  return {
    tenantId: asTenantId(tenantId),
    workspaceId: asWorkspaceId(workspaceId),
    projectId: asProjectId(projectId),
  };
}

export function serializeScope(scope: ProjectScope): string {
  return `${scope.tenantId}/${scope.workspaceId}/${scope.projectId}`;
}

export function parseScope(value: string): ProjectScope {
  const parts = value.split("/");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new Error(`invalid scope: ${value}`);
  }
  return buildScope(parts[0], parts[1], parts[2]);
}

export function sameScope(a: ProjectScope, b: ProjectScope): boolean {
  return serializeScope(a) === serializeScope(b);
}
