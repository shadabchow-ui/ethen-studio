import { redirect } from "next/navigation";

/**
 * V5 M1 (Owner Lock O) — page-level mirror of the canonical one-hop
 * redirect in next.config.ts (STUDIO_LEGACY_REDIRECTS). Config redirects run
 * first and forward the query string; this stub only guarantees the same
 * destination if the config table ever changes.
 */
export default function StudioCanvasRoute() {
  redirect("/studio/workflows");
}
