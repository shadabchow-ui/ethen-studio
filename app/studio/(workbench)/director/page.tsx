import { redirect } from "next/navigation";

/**
 * V5 M5 — page-level mirror of the canonical one-hop redirect in
 * next.config.ts (STUDIO_LEGACY_REDIRECTS). The legacy director panel is
 * retired; agentic creation runs on the Creative Agent surface.
 */
export default async function StudioDirectorRoute({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const params = await searchParams;
  const suffix = params.projectId ? `?projectId=${encodeURIComponent(params.projectId)}` : "";
  redirect(`/studio/agent${suffix}`);
}
