import { CreationDialog } from "@/components/studio/v5/discovery/explore/CreationDialog";

/**
 * Intercepted creation detail: soft navigation from any Studio page opens
 * the overlay over the current page while the URL shows the canonical
 * /studio/explore/creation/[id] (which renders in full on refresh).
 */
export default async function StudioCreationOverlay({ params }: { params: Promise<{ creationId: string }> }) {
  const { creationId } = await params;
  return <CreationDialog creationId={decodeURIComponent(creationId)} />;
}
