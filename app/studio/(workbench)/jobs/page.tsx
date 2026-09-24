import { redirect } from "next/navigation";

/**
 * V5 M1 (Owner Lock O) — page-level mirror of the canonical one-hop
 * redirect in next.config.ts. The legacy list surface retired; jobs
 * live on the canonical work surface.
 */
export default function StudioJobsRoute() {
  redirect("/studio/work/jobs");
}
