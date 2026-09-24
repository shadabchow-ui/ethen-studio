import { redirect } from "next/navigation";

/**
 * V5 M1 (Owner Lock O) — page-level mirror of the canonical one-hop
 * redirect in next.config.ts. Brands live on the identities surface.
 */
export default async function StudioProjectBrandsRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/studio/identities/brands?projectId=${encodeURIComponent(projectId)}`);
}
