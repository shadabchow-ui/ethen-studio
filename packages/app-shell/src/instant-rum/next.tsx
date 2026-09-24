/**
 * IE-M3 M3-03 — Next.js RUM adapter (client boundary).
 *
 * Starts the import-free core (`../instant-rum`) once per enabled app
 * session and gates collection on the host's consent/logging-mode flag.
 * Route identity comes from `data-iex-route` markers in the host app
 * (M3-07). The collector reads `location.pathname` at click/finish time
 * and must not restart on soft navigation. R5 attribution (`ethen_src` →
 * source_app, own app → target_app) is resolved in the core.
 */
"use client";

import { useEffect } from "react";
import { matchRouteTemplate, startInstantRum, type RouteClass } from "../instant-rum";

export interface EthenRumNextProps {
  app: string;
  /** v1 product where one exists; omit for post-v1 surfaces (e.g. web). */
  product?: "chat" | "platform" | "missions" | "studio" | "designer";
  releaseSha: string;
  endpoint: string;
  /**
   * Pathname prefix → [template, route class]. Longest prefix wins.
   * Prefer the single-authority maps in `@ethen/contracts/rum/route-identity`
   * over app-local duplicates: the same module feeds the sink allowlist, so
   * emitted templates are accepted by construction.
   */
  routes?: Readonly<Record<string, { route: string; routeClass: RouteClass | null }>>;
  /**
   * Pass 2: full pathname resolver, replacing prefix matching when the app
   * needs segment-aware templates (e.g. platform `/projects/<id>/<section>`).
   * At least one of `routes` / `resolveRoute` is required.
   */
  resolveRoute?: (pathname: string) => { route: string; routeClass: RouteClass | null } | null;
  /** Consent/logging-mode gate from the host app. Collection starts only when true. */
  enabled: boolean;
  sampleRate?: number;
}

export function EthenRumNext({ app, product, releaseSha, endpoint, routes, resolveRoute, enabled, sampleRate }: EthenRumNextProps): null {
  useEffect(() => {
    if (!enabled) return () => {};
    if (!routes && !resolveRoute) {
      throw new Error(`EthenRumNext(${app}): requires routes or resolveRoute`);
    }
    const stop = startInstantRum({
      app,
      product: product ?? null,
      releaseSha,
      endpoint,
      runtime: "next",
      targetApp: app,
      sampleRate,
      routeTemplate: resolveRoute ?? ((path: string) => matchRouteTemplate(path, routes!)),
    });
    return stop;
    // Pathname is intentionally omitted: the collector must live for the app
    // session. Restarting on soft navigation tears down an in-flight click
    // before finish()/flush() and yields zero samples.
  }, [app, product, releaseSha, endpoint, routes, resolveRoute, enabled, sampleRate]);
  return null;
}
