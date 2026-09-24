import { redirect } from "next/navigation";

/**
 * V5 M5 — page-level mirror of the canonical one-hop redirect in
 * next.config.ts (STUDIO_LEGACY_REDIRECTS). Project assets converge on
 * the canonical work surface.
 */
export default async function StudioProjectAssetsRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/studio/work/assets?projectId=${encodeURIComponent(projectId)}`);
}
