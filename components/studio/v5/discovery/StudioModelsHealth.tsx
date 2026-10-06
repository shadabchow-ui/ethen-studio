/**
 * STUDIO M5 — expert models surface on measured provider health.
 *
 * Replaces the retired StudioModelsExpert behind ?view=expert: one row per
 * provider with the six measured booleans from
 * GET /api/studio/v1/health/providers. Unmeasured is "Unknown" — the view
 * never invents a green. Deep links to ?view=expert keep working.
 *
 * RC3 — signed-out renders a sign-in prompt (a 401 is not "unmeasured"),
 * failures render an error with Retry, and "Checking…" shows only while
 * the request is actually in flight (bounded by the hook timeout).
 */

"use client";

import { requestStudioSignIn } from "../../auth/studio-auth-action-core";
import { StudioStatusPill } from "../../StudioStatusPill";
import { providerHealthLabel, providerHealthTone, useProviderHealth } from "../health/provider-health";

const MEASUREMENTS = [
  ["configured", "Configured"],
  ["reachable", "Reachable"],
  ["registered", "Registered"],
  ["catalogQualified", "Qualified"],
  ["workerReady", "Worker"],
  ["storageReady", "Storage"],
] as const;

const TONE_PILL = { live: "live", down: "setup", unknown: "neutral" } as const;

export function StudioModelsHealth() {
  const { health, status, error, retry } = useProviderHealth();
  const loading = status === "loading";
  const providers = Object.entries(health ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));

  return (
    <div className="space-y-2" data-testid="studio-models-health">
      {loading ? <p className="text-[12.5px] text-[var(--text-secondary)]">Checking provider health…</p> : null}
      {!loading && status === "signed_out" ? (
        <p className="text-[12.5px] text-[var(--text-secondary)]">
          Sign in to see provider health.{" "}
          <button
            type="button"
            onClick={() => requestStudioSignIn({ action: "models-health-signin" })}
            className="underline"
          >
            Sign in
          </button>
        </p>
      ) : null}
      {!loading && status === "error" ? (
        <p className="text-[12.5px] text-[var(--text-secondary)]">
          {error ?? "Provider health could not be loaded."}{" "}
          <button type="button" onClick={retry} className="underline">
            Retry
          </button>
        </p>
      ) : null}
      {!loading && status === "ready" && providers.length === 0 ? (
        <p className="text-[12.5px] text-[var(--text-secondary)]">Provider health is unmeasured right now.</p>
      ) : null}
      {providers.map(([name, view]) => {
        const tone = providerHealthTone(view);
        return (
          <section key={name} className="rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-4">
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-medium capitalize text-[var(--text-primary)]">{name}</h2>
              <span className="ml-auto">
                <StudioStatusPill label={providerHealthLabel(view, loading)} tone={TONE_PILL[tone]} />
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
              {MEASUREMENTS.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <dt className="text-[var(--text-secondary)]">{label}</dt>
                  <dd className="font-mono text-[var(--text-primary)]">{view[key] ? "yes" : "no"}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
