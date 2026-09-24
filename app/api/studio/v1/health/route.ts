/**
 * M5 D3 — V1 release health probe. Replaces the retired legacy health
 * adapter with the same contract: proves web
 * availability without secrets, database, or provider work. Liveness
 * only; readiness (DB/worker) is observed through release signals,
 * never through an expensive health check. Public by guard design
 * (see `isPublicHealthApi`).
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    { ok: true, app: "@ethen/studio", release: "v1" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
