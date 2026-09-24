import { redirect } from "next/navigation";

/**
 * V5 M5 — page-level mirror of the canonical one-hop redirect in
 * next.config.ts (STUDIO_LEGACY_REDIRECTS). The beta campaigns console is
 * retired; brief-led campaigns run on Marketing Studio composites.
 */
export default async function StudioCampaignsRoute({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const params = await searchParams;
  const suffix = params.projectId ? `?projectId=${encodeURIComponent(params.projectId)}` : "";
  redirect(`/studio/marketing${suffix}`);
}
