import { redirect } from "next/navigation";

/**
 * V5 M5 — page-level mirror of the canonical one-hop redirect in
 * next.config.ts (STUDIO_LEGACY_REDIRECTS). Config redirects run first and
 * forward the query string; this stub only guarantees the same destination
 * if the config table ever changes.
 */
export default async function StudioProjectCreateImageRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/studio/create/image?projectId=${encodeURIComponent(projectId)}`);
}
