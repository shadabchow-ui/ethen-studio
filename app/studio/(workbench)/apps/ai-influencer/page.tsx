import { redirect } from "next/navigation";

/**
 * V5 M5 — page-level mirror of the canonical one-hop redirect in
 * next.config.ts (STUDIO_LEGACY_REDIRECTS). The legacy workbench panel is
 * retired; influencer creation runs on the canonical surface.
 */
export default async function AiInfluencerAppRoute({ searchParams }: { searchParams: Promise<{ prompt?: string; projectId?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.projectId) query.set("projectId", params.projectId);
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/studio/influencer${suffix}`);
}
