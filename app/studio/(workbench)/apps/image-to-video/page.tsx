import { redirect } from "next/navigation";

/**
 * V5 M5 — page-level mirror of the canonical one-hop redirect in
 * next.config.ts (STUDIO_LEGACY_REDIRECTS). The legacy workbench panel is
 * retired; creation runs on the canonical runtime.
 */
export default async function ImageToVideoRoute({ searchParams }: { searchParams: Promise<{ prompt?: string; projectId?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ mode: "image-to-video" });
  if (params.prompt) query.set("prompt", params.prompt);
  if (params.projectId) query.set("projectId", params.projectId);
  redirect(`/studio/create/video?${query.toString()}`);
}
