"use client";

/**
 * STUDIO_10 — version & rights drawer.
 *
 * Immutable version history plus consent/rights state for one
 * identity. Versions are listed newest-first with content hashes;
 * revocation and consent blocks are explicit, never silent.
 */
import { useEffect, useState } from "react";
import { StudioInspectorDrawer } from "../shell/InspectorDrawer";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { StudioDataState } from "../shell/types";
import { consentBadgeFor, parseIdentityVersionsResponse, parseVoiceBindingsResponse } from "./identity-api-client";
import type { IdentityListItem, IdentityVersionView, VoiceBindingView } from "./types";

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  return (await response.json().catch(() => ({}))) as unknown;
}

export function VersionRightsDrawer({
  projectId,
  identity,
  onClose,
}: {
  projectId: string | null;
  identity: IdentityListItem | null;
  onClose: () => void;
}): React.JSX.Element {
  const [versionState, setVersionState] = useState<StudioDataState>("loading");
  const [versions, setVersions] = useState<IdentityVersionView[]>([]);
  const [bindings, setBindings] = useState<VoiceBindingView[]>([]);
  const [bindingsState, setBindingsState] = useState<StudioDataState>("loading");

  // Parents key this drawer by identity id, so a fresh identity always
  // starts from the loading states above — no synchronous effect reset.
  useEffect(() => {
    if (!identity || !projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const parsed = parseIdentityVersionsResponse(
          await fetchJson(`/api/studio/v1/identities/${identity.identityId}/versions?projectId=${encodeURIComponent(projectId)}`),
        );
        if (cancelled) return;
        setVersions(parsed.versions);
        setVersionState(parsed.state);
      } catch {
        if (!cancelled) setVersionState("error");
      }
      if (identity.kind !== "voice") {
        if (!cancelled) {
          setBindings([]);
          setBindingsState("ready");
        }
        return;
      }
      try {
        const parsed = parseVoiceBindingsResponse(
          await fetchJson(
            `/api/studio/v1/voices/bindings?projectId=${encodeURIComponent(projectId)}&identityId=${encodeURIComponent(identity.identityId)}`,
          ),
        );
        if (cancelled) return;
        setBindings(parsed.bindings);
        setBindingsState(parsed.state);
      } catch {
        if (!cancelled) setBindingsState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity, projectId]);

  const badge = identity ? consentBadgeFor(identity.consent) : null;

  return (
    <StudioInspectorDrawer open={identity !== null} onClose={onClose} title={identity ? `${identity.name} — versions & rights` : "Versions & rights"} testId="identity-version-rights-drawer">
      {identity && badge ? (
        <div className="space-y-4">
          <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
            <p className="text-[12px] font-medium text-[var(--text-primary)]">Rights</p>
            <p className="mt-1 text-[12.5px] text-[var(--text-secondary)]">{badge.label}</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">
              Origin: {identity.stock ? "Stock" : identity.origin} · Status: {identity.status}
              {badge.blocked ? " · This identity is blocked until rights are resolved." : ""}
            </p>
          </div>

          <div>
            <p className="text-[12px] font-medium text-[var(--text-primary)]">Versions (immutable)</p>
            {versionState === "loading" ? (
              <p role="status" className="mt-1 text-[12px] text-[var(--text-tertiary)]">Loading versions…</p>
            ) : null}
            {versionState === "error" ? (
              <p role="alert" className="mt-1 text-[12px] text-[var(--text-secondary)]">Versions could not be loaded.</p>
            ) : null}
            {versionState === "ready" || versionState === "empty" ? (
              <ul className="mt-2 space-y-1.5">
                {versions.map((version) => (
                  <li key={version.version} className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5">
                    <p className="text-[12.5px] font-medium text-[var(--text-primary)]">
                      Version {version.version}
                      {version.version === identity.currentVersion ? " (current)" : ""}
                      {version.revokedAt ? " · revoked" : ""}
                    </p>
                    <p className="mt-0.5 break-all text-[11px] text-[var(--text-tertiary)]">{version.contentHash}</p>
                    <p className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">
                      {version.consentGrantId ? `Consent grant ${version.consentGrantId}` : "No consent grant attached"}
                    </p>
                  </li>
                ))}
                {versions.length === 0 ? (
                  <li className="text-[12px] text-[var(--text-tertiary)]">No versions recorded.</li>
                ) : null}
              </ul>
            ) : null}
          </div>

          {identity.kind === "voice" ? (
            <div>
              <p className="text-[12px] font-medium text-[var(--text-primary)]">Provider bindings</p>
              <p className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">
                Bindings pin provider voices and models. Pending bindings await qualification and cannot be used.
              </p>
              {bindingsState === "loading" ? (
                <p role="status" className="mt-1 text-[12px] text-[var(--text-tertiary)]">Loading bindings…</p>
              ) : null}
              {bindingsState === "error" ? (
                <p role="alert" className="mt-1 text-[12px] text-[var(--text-secondary)]">Bindings could not be loaded.</p>
              ) : null}
              {bindingsState === "ready" || bindingsState === "empty" ? (
                <ul className="mt-2 space-y-1.5">
                  {bindings.map((binding) => (
                    <li key={binding.bindingId} className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-2.5">
                      <p className="text-[12.5px] font-medium text-[var(--text-primary)]">
                        {binding.providerId} · {binding.providerVoiceId}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">
                        Version {binding.identityVersion} · {binding.adapterVersion} ·{" "}
                        {binding.state === "bound"
                          ? `Bound to ${binding.endpointId}`
                          : binding.state === "pending"
                            ? "Pending endpoint qualification"
                            : "Revoked"}
                      </p>
                      {binding.loraRefs.length > 0 ? (
                        <p className="mt-0.5 text-[11.5px] text-[var(--text-tertiary)]">
                          LoRA: {binding.loraRefs.join(", ")} (pinned, not portable)
                        </p>
                      ) : null}
                    </li>
                  ))}
                  {bindings.length === 0 ? (
                    <li className="text-[12px] text-[var(--text-tertiary)]">No provider bindings yet.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className={`inline-flex min-h-[44px] items-center rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Close
          </button>
        </div>
      ) : null}
    </StudioInspectorDrawer>
  );
}
