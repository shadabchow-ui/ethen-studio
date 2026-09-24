import { redirect } from "next/navigation";

/**
 * V5 M1 (Owner Lock O) — page-level mirror of the canonical one-hop
 * redirect in next.config.ts. Products live on the identities surface.
 */
export default async function StudioProjectProductsRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/studio/identities/products?projectId=${encodeURIComponent(projectId)}`);
}
