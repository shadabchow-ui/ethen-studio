import "server-only";

import { cookies } from "next/headers";
import { preferredProjectId, STUDIO_ACTIVE_PROJECT_COOKIE } from "./active-project";

/** Saved active project from the request cookie (unvalidated). */
export async function readActiveProjectCookie(): Promise<string | null> {
  const store = await cookies();
  return preferredProjectId({ cookieProjectId: store.get(STUDIO_ACTIVE_PROJECT_COOKIE)?.value });
}

/**
 * Page-level project scope: URL `projectId` override, else the saved
 * selection. Pages pass the result to their adapters; data routes still
 * authorize membership on every read.
 */
export async function resolvePageProjectId(query: { projectId?: string | string[] | undefined }): Promise<string | null> {
  const url = Array.isArray(query.projectId) ? query.projectId[0] : query.projectId;
  return preferredProjectId({ urlProjectId: url, cookieProjectId: await readActiveProjectCookie() });
}
