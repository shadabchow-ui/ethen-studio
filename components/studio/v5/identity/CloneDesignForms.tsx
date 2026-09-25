"use client";

/**
 * STUDIO_10 — Design / Clone forms.
 *
 * Identity creation flows with purpose, evidence, locale, and rights
 * stated before anything usable exists. These forms never masquerade
 * as model choices: no endpoint picker, no provider blobs — and clone
 * without consent evidence is denied, never silently queued.
 */
import { useState } from "react";
import { useAuthActionGate } from "@/components/studio/auth/studio-auth-action";
import { StudioInspectorDrawer } from "../shell/InspectorDrawer";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import type { IdentityCreationDraft, IdentityCreationFlow } from "./types";

const FLOW_COPY: Record<IdentityCreationFlow, { title: string; intro: string; submit: string }> = {
  design: {
    title: "Design a new voice",
    intro: "Describe the voice to create. Design proceeds only through a qualified speech capability.",
    submit: "Request voice design",
  },
  clone: {
    title: "Clone a voice",
    intro: "Cloning requires recorded consent evidence plus a qualified speech capability. Without evidence the request is denied.",
    submit: "Request voice clone",
  },
};

const CAPABILITIES: readonly { value: string; label: string }[] = [
  { value: "speech.synthesize", label: "Speech synthesis" },
];

const inputClass =
  "w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]";

export function CloneDesignForms({
  projectId,
  flow,
  onClose,
  onCreated,
}: {
  projectId: string | null;
  flow: IdentityCreationFlow | null;
  onClose: () => void;
  onCreated: (identityId: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<IdentityCreationDraft>({
    flow: "design",
    name: "",
    purpose: "",
    evidenceRef: "",
    locale: "",
    capability: "speech.synthesize",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active: IdentityCreationFlow = flow ?? draft.flow;
  const copy = FLOW_COPY[active];

  const set = (patch: Partial<IdentityCreationDraft>): void => {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  // S4C: anonymous voice-clone submit opens the Clerk modal and sends NO
  // request; the draft stays in component state for retry after sign-in.
  const authGate = useAuthActionGate();
  const runSubmit = async (): Promise<void> => {
    if (!projectId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/studio/v1/voices/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          flow: active,
          name: draft.name,
          purpose: draft.purpose,
          evidenceRef: draft.evidenceRef.trim() ? draft.evidenceRef.trim() : null,
          locale: draft.locale,
          capability: draft.capability,
        }),
      });
      const envelope = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { identity?: { identityId?: string }; use?: { reason?: string } };
        error?: { code?: string; message?: string };
      };
      if (envelope.ok !== true) {
        setError(
          envelope.error?.code === "CONSENT_REQUIRED"
            ? `Denied: ${envelope.error.message ?? "consent evidence is required."}`
            : envelope.error?.code === "PROVIDER_UNAVAILABLE"
              ? `Unavailable: ${envelope.error.message ?? "no qualified capability."}`
              : envelope.error?.code === "SETUP_REQUIRED"
                ? `Setup needed: ${envelope.error.message ?? "voice creation needs a live provider."}`
                : (envelope.error?.message ?? "The request could not be submitted."),
        );
        return;
      }
      const identityId = envelope.data?.identity?.identityId;
      if (!identityId) {
        setError("The request succeeded but returned no identity.");
        return;
      }
      onCreated(identityId);
      onClose();
    } catch {
      setError("The request could not be submitted. Retry to reload.");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = (): void => {
    authGate.runAuthed(() => void runSubmit(), "voice-clone");
  };

  return (
    <StudioInspectorDrawer open={flow !== null} onClose={onClose} title={copy.title} testId="identity-clone-design-drawer">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="text-[12.5px] leading-5 text-[var(--text-secondary)]">{copy.intro}</p>
        <div>
          <label htmlFor="identity-creation-name" className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
            Name
          </label>
          <input
            id="identity-creation-name"
            type="text"
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
            placeholder="e.g. Narrator — warm"
            maxLength={120}
            required
            className={`${inputClass} ${STUDIO_FOCUS_RING_CLASS}`}
          />
        </div>
        <div>
          <label htmlFor="identity-creation-purpose" className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
            Purpose
          </label>
          <textarea
            id="identity-creation-purpose"
            value={draft.purpose}
            onChange={(event) => set({ purpose: event.target.value })}
            placeholder="What will this voice be used for?"
            rows={3}
            required
            className={`${inputClass} ${STUDIO_FOCUS_RING_CLASS}`}
          />
        </div>
        <div>
          <label htmlFor="identity-creation-evidence" className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
            Consent evidence reference{active === "clone" ? " (required)" : " (optional)"}
          </label>
          <input
            id="identity-creation-evidence"
            type="text"
            value={draft.evidenceRef}
            onChange={(event) => set({ evidenceRef: event.target.value })}
            placeholder="Consent grant or evidence locator"
            required={active === "clone"}
            className={`${inputClass} ${STUDIO_FOCUS_RING_CLASS}`}
          />
          <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">
            {active === "clone"
              ? "Clone requests without recorded consent evidence are denied."
              : "Designs record any supplied evidence with the new identity."}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="identity-creation-locale" className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
              Locale
            </label>
            <input
              id="identity-creation-locale"
              type="text"
              value={draft.locale}
              onChange={(event) => set({ locale: event.target.value })}
              placeholder="e.g. en-US"
              maxLength={32}
              required
              className={`${inputClass} ${STUDIO_FOCUS_RING_CLASS}`}
            />
          </div>
          <div>
            <label htmlFor="identity-creation-capability" className="mb-1 block text-[12px] font-medium text-[var(--text-primary)]">
              Capability
            </label>
            <select
              id="identity-creation-capability"
              value={draft.capability}
              onChange={(event) => set({ capability: event.target.value })}
              className={`${inputClass} ${STUDIO_FOCUS_RING_CLASS}`}
            >
              {CAPABILITIES.map((capability) => (
                <option key={capability.value} value={capability.value}>
                  {capability.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">
              Must be qualified; unqualified capabilities cannot start this flow.
            </p>
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-[12.5px] leading-5 text-[var(--text-primary)]">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting || !projectId}
            className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--studio-bg-selected)] disabled:cursor-not-allowed disabled:opacity-60 ${STUDIO_FOCUS_RING_CLASS}`}
          >
            {submitting ? "Submitting…" : copy.submit}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex min-h-[44px] items-center rounded-[10px] px-4 py-2.5 text-[12.5px] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] ${STUDIO_FOCUS_RING_CLASS}`}
          >
            Cancel
          </button>
        </div>
      </form>
    </StudioInspectorDrawer>
  );
}
