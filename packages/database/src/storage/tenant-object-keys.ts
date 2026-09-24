import "server-only";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function tenantObjectKey(projectId: string, objectId: string, filename: string): string {
  if (!ID.test(projectId) || !ID.test(objectId) || !SEGMENT.test(filename)) throw new Error("Invalid tenant object key input.");
  return `projects/${projectId}/objects/${objectId}/${filename}`;
}

export function parseTenantObjectKey(key: string): { projectId: string; objectId: string; filename: string } | null {
  const match = /^projects\/([0-9a-f-]{36})\/objects\/([0-9a-f-]{36})\/([^/]+)$/i.exec(key);
  if (!match || !ID.test(match[1]) || !ID.test(match[2]) || !SEGMENT.test(match[3])) return null;
  return { projectId: match[1], objectId: match[2], filename: match[3] };
}
