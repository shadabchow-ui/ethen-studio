import { redirect } from "next/navigation";

/**
 * V5 M1 (Owner Lock O) — page-level mirror of the canonical one-hop
 * redirect in next.config.ts. The legacy list surface retired; projects
 * live on the canonical work surface.
 */
export default function StudioProjectsRoute() {
  redirect("/studio/work/projects");
}
