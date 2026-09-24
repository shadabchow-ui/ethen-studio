import { redirect } from "next/navigation";

/**
 * V5 M1 (Owner Lock O) — page-level mirror of the canonical one-hop
 * redirect in next.config.ts. The legacy list surface retired; assets
 * live on the canonical work surface.
 */
export default function StudioAssetsRoute() {
  redirect("/studio/work/assets");
}
