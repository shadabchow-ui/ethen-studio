import { redirect } from "next/navigation";

/**
 * V5 M1 (Owner Lock O) — page-level mirror of the canonical one-hop
 * redirect in next.config.ts. Characters live on the identities surface.
 */
export default async function StudioProjectCharactersRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/studio/identities/characters?projectId=${encodeURIComponent(projectId)}`);
}
