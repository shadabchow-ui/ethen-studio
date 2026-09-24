/**
 * Shared settings sections: General, Account, Privacy, Billing & Usage,
 * Capabilities, Memory. Identical in Chat and Designer — product containers
 * only supply navigation + product-specific props (memory areas, import).
 */
"use client";

import * as React from "react";
import Link from "next/link";
import {
  SETTINGS_LIMITS,
  SETTINGS_LOCALES,
  type UserSettings,
} from "./settings-schema";
import { useThemePreference } from "../theme/theme-preference";
import { ThemeSegmentedControl } from "../chat-lab/theme-segmented-control";
import { resolveGreeting } from "../chat-lab/chat-greeting";
import type { UserSettingsState } from "./settings-client";
import {
  SettingsButton,
  SettingsDangerAction,
  SettingsEmptyState,
  SettingsErrorState,
  SettingsGroup,
  SettingsRow,
  SettingsSaveState,
  SettingsSection,
  SettingsSelect,
  SettingsTable,
  SettingsTextarea,
  SettingsTextField,
  SettingsToggle,
} from "./settings-shell";
import {
  deleteJson,
  formatDate,
  postJson,
  useAsyncData,
  type AccountInfo,
  type BillingResponse,
  type DeleteEligibility,
  type SessionsResponse,
  type UsageResponse,
} from "./settings-data";

export interface SectionCtx {
  state: UserSettingsState;
  /** Jump to another settings section (deep-link navigation). */
  onNavigate: (sectionId: string) => void;
}

function useCtxState(ctx: SectionCtx): UserSettings {
  return ctx.state.settings;
}

// ── General (profile + appearance + language) ────────────────────────────────

export function GeneralSection({ ctx }: { ctx: SectionCtx }) {
  const { state, onNavigate } = ctx;
  const settings = useCtxState(ctx);
  const [, setTheme] = useThemePreference();
  const [draft, setDraft] = React.useState(() => ({ ...settings.general }));
  const [saving, setSaving] = React.useState(false);
  const [savedNote, setSavedNote] = React.useState<string | null>(null);

  const dirty =
    draft.fullName !== settings.general.fullName ||
    draft.preferredName !== settings.general.preferredName ||
    draft.workRole !== settings.general.workRole ||
    draft.instructions !== settings.general.instructions ||
    draft.locale !== settings.general.locale;

  // Adopt server/profile changes into the draft (render-phase adjustment).
  // CHAT-08: never clobber unsaved edits — unrelated settings updates
  // (e.g. theme) rebuild the general object identity without changing its
  // values, which used to wipe the draft. Dirty drafts win; clean drafts
  // still track the server.
  const [adoptedGeneral, setAdoptedGeneral] = React.useState(settings.general);
  if (adoptedGeneral !== settings.general) {
    setAdoptedGeneral(settings.general);
    if (!dirty) setDraft({ ...settings.general });
  }

  React.useEffect(() => {
    // Unsaved-change protection is owned by the shell host via onDirty.
    (ctx as { onDirty?: (dirty: boolean) => void }).onDirty?.(dirty);
  }, [ctx, dirty]);

  const set = (key: keyof typeof draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSavedNote(null);
  };

  const saveProfile = async () => {
    setSaving(true);
    setSavedNote(null);
    const ok = await state.save({
      general: {
        ...settings.general,
        fullName: draft.fullName.slice(0, SETTINGS_LIMITS.fullName),
        preferredName: draft.preferredName.slice(0, SETTINGS_LIMITS.preferredName),
        workRole: draft.workRole.slice(0, SETTINGS_LIMITS.workRole),
        instructions: draft.instructions.slice(0, SETTINGS_LIMITS.instructions),
        locale: draft.locale,
      },
    });
    setSaving(false);
    setSavedNote(ok ? "Profile saved. Preferred name applies to new greetings; instructions apply to new runs." : null);
  };

  const setAppearanceTheme = (next: "light" | "dark" | "system") => {
    setTheme(next);
    void state.update({ appearance: { ...settings.appearance, theme: next } });
  };

  const greetingPreview = resolveGreeting({
    preferredName: draft.preferredName,
    fullName: draft.fullName,
  });

  return (
    <SettingsSection id="general" title="General" meta="Profile, appearance and language. Shared across Chat and Designer.">
      <SettingsGroup label="Profile">
        <SettingsRow
          id="setting-avatar"
          title="Avatar"
          detail={settings.general.avatarUrl ? "Custom avatar" : "No custom avatar — your initial is shown"}
          action={
            <SettingsButton disabled disabledReason="Avatar upload is not available in this deployment">
              Upload
            </SettingsButton>
          }
        />
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <SettingsTextField
            id="setting-fullname"
            label="Full name"
            value={draft.fullName}
            maxLength={SETTINGS_LIMITS.fullName}
            onChange={(v) => set("fullName", v)}
          />
          <SettingsTextField
            id="setting-preferredname"
            label="What should Ethen call you?"
            value={draft.preferredName}
            maxLength={SETTINGS_LIMITS.preferredName}
            detail={`Greeting preview: ${greetingPreview}`}
            onChange={(v) => set("preferredName", v)}
          />
          <SettingsTextField
            id="setting-workrole"
            label="Work role"
            value={draft.workRole}
            maxLength={SETTINGS_LIMITS.workRole}
            onChange={(v) => set("workRole", v)}
          />
          <SettingsTextarea
            id="setting-instructions"
            label="Personal instructions for Ethen"
            value={draft.instructions}
            maxLength={SETTINGS_LIMITS.instructions}
            detail="Injected into permitted product context for new runs — never rewritten into past outputs."
            onChange={(v) => set("instructions", v)}
          />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <SettingsButton variant="primary" onClick={() => void saveProfile()} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save profile"}
          </SettingsButton>
          {dirty ? <small style={{ color: "var(--eds-text-secondary)" }}>Unsaved changes.</small> : null}
          {savedNote ? <small role="status">{savedNote}</small> : null}
        </div>
      </SettingsGroup>

      <SettingsGroup label="Appearance">
        <SettingsRow
          id="setting-theme"
          title="Theme"
          detail="System follows the operating system, live"
          action={<ThemeSegmentedControl onChange={setAppearanceTheme} />}
        />
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <SettingsTextField
            id="setting-interface-font"
            label="Interface font"
            value={settings.appearance.interfaceFont}
            detail="Default: Instrument Sans"
            onChange={(v) => void state.update({ appearance: { ...settings.appearance, interfaceFont: v.slice(0, 80) || "Instrument Sans" } })}
          />
          <SettingsTextField
            id="setting-content-font"
            label="Content font"
            value={settings.appearance.contentFont}
            detail="Default: Newsreader"
            onChange={(v) => void state.update({ appearance: { ...settings.appearance, contentFont: v.slice(0, 80) || "Newsreader" } })}
          />
          <SettingsSelect
            id="setting-motion"
            label="Motion"
            value={settings.appearance.motion}
            onChange={(v) => void state.update({ appearance: { ...settings.appearance, motion: v as UserSettings["appearance"]["motion"] } })}
            options={[
              { value: "system", label: "System" },
              { value: "full", label: "Full" },
              { value: "reduced", label: "Reduced" },
            ]}
          />
          <SettingsSelect
            id="setting-density"
            label="Density"
            value={settings.appearance.density}
            onChange={(v) => void state.update({ appearance: { ...settings.appearance, density: v as UserSettings["appearance"]["density"] } })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </div>
        <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>
          Code presentation lives under{" "}
          <button type="button" onClick={() => onNavigate("developer")} style={{ textDecoration: "underline", background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer", color: "inherit" }}>
            Developer &amp; Runtime
          </button>
          .
        </p>
      </SettingsGroup>

      <SettingsGroup label="Language">
        <SettingsSelect
          id="setting-locale"
          label="Interface language"
          value={SETTINGS_LOCALES.some((l) => l.code === draft.locale && l.available) ? draft.locale : "en-US"}
          detail="Changing language never rewrites your stored content."
          onChange={(v) => set("locale", v)}
          options={SETTINGS_LOCALES.map((locale) => ({
            value: locale.code,
            label: locale.label,
            disabled: !locale.available,
            disabledReason: locale.unavailableReason,
          }))}
        />
        <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>
          Only languages with shipped translations are selectable. Save profile above to apply.
        </p>
      </SettingsGroup>
    </SettingsSection>
  );
}

// ── Account & security ───────────────────────────────────────────────────────

export function AccountSection({ ctx }: { ctx: SectionCtx }) {
  const account = useAsyncData<AccountInfo>("/api/settings/account");
  const sessions = useAsyncData<SessionsResponse>("/api/settings/sessions");
  const [loggingOut, setLoggingOut] = React.useState(false);

  const logoutCurrent = async () => {
    setLoggingOut(true);
    await deleteJson("/api/settings/sessions/current");
    window.location.href = "/sign-in";
  };

  const info = account.data;
  const list = sessions.data?.sessions ?? [];

  return (
    <SettingsSection id="account" title="Account" meta="Sessions, devices and deletion. Shared across Chat and Designer.">
      {account.loading ? (
        <p role="status" style={{ fontSize: 13 }}>Checking session…</p>
      ) : account.error === "signed_out" || info?.signedIn === false ? (
        <>
          <SettingsRow title="Session" detail="Not signed in — actions that need an account will ask you to sign in first" />
          <SettingsRow title="Sign in" detail="Continue with your Ethen account" action={<Link href="/sign-in" style={{ fontSize: 13 }}>Sign in</Link>} />
        </>
      ) : account.error ? (
        <SettingsErrorState message={account.error} onRetry={() => void account.refresh()} />
      ) : (
        <>
          <SettingsRow title="Session" detail="Signed in — settings sync across Chat and Designer" />
          <SettingsRow title="Account ID" detail={info?.accountId ?? info?.actorId ?? "Unknown"} />
          {typeof info?.ownerReview === "boolean" ? (
            <SettingsRow title="Environment" detail={info.ownerReview ? "Local review" : "Managed deployment"} />
          ) : null}
          {info?.model ? <SettingsRow title="Chat model" detail={`${info.model} · ${info.provider ?? "managed"}`} /> : null}
          <SettingsRow
            title="Log out this device"
            detail="Ends the current session and returns to sign-in"
            action={<SettingsButton onClick={() => void logoutCurrent()} disabled={loggingOut}>{loggingOut ? "Logging out…" : "Log out"}</SettingsButton>}
          />
        </>
      )}

      <SettingsGroup label="Active sessions">
        {sessions.loading ? (
          <p role="status" style={{ fontSize: 13 }}>Loading sessions…</p>
        ) : sessions.error === "signed_out" ? (
          <p style={{ fontSize: 13 }}>Sign in to see sessions.</p>
        ) : sessions.error ? (
          <SettingsErrorState message={sessions.error} onRetry={() => void sessions.refresh()} />
        ) : (
          <>
            {sessions.data?.scopeNote ? (
              <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>{sessions.data.scopeNote}</p>
            ) : null}
            <SettingsTable
              caption="Active sessions"
              head={["Session", "Status", "Last active", ""]}
              rows={list.map((session) => [
                <span key="id">
                  <code style={{ fontSize: 12 }}>{session.id === "current" ? "This device" : session.id.slice(0, 12)}</code>
                  {session.current ? <small style={{ color: "var(--eds-text-secondary)" }}> · current</small> : null}
                </span>,
                <span key="st" style={{ fontSize: 12 }}>{session.status}</span>,
                <span key="la" style={{ fontSize: 12 }}>{formatDate(session.lastActiveAt ?? session.updatedAt)}</span>,
                <span key="rv">
                  <SettingsButton
                    onClick={() => {
                      void deleteJson(`/api/settings/sessions/${encodeURIComponent(session.id)}`).then(() => sessions.refresh());
                    }}
                  >
                    Revoke
                  </SettingsButton>
                </span>,
              ])}
            />
            {list.length === 0 ? <SettingsEmptyState message="No other active sessions." /> : null}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup label="Danger zone">
        <LogoutAllRow onDone={() => { window.location.href = "/sign-in"; }} />
        <DeleteAccountRow />
      </SettingsGroup>
    </SettingsSection>
  );
}

function LogoutAllRow({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div>
      <SettingsRow
        title="Log out all devices"
        detail="Revokes every session, including this one"
        action={
          confirming ? (
            <span style={{ display: "flex", gap: 8 }}>
              <SettingsButton
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void postJson("/api/settings/account/logout-all").then((result) => {
                    setBusy(false);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    onDone();
                  });
                }}
              >
                {busy ? "Revoking…" : "Revoke all"}
              </SettingsButton>
              <SettingsButton onClick={() => { setConfirming(false); setError(null); }}>Cancel</SettingsButton>
            </span>
          ) : (
            <SettingsButton onClick={() => setConfirming(true)}>Log out all</SettingsButton>
          )
        }
      />
      {error ? <p role="alert" style={{ fontSize: 13, color: "var(--eds-danger, #c2402a)" }}>{error}</p> : null}
    </div>
  );
}

function DeleteAccountRow() {
  const [stage, setStage] = React.useState<"idle" | "checking" | "ready" | "blocked" | "confirming" | "done">("idle");
  const [eligibility, setEligibility] = React.useState<DeleteEligibility | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const check = async () => {
    setStage("checking");
    setError(null);
    const result = await postJson<DeleteEligibility>("/api/settings/account/delete", {});
    // Eligibility is a GET; a POST without confirm returns 400 with guidance.
    // Fetch GET directly for the check.
    try {
      const response = await fetch("/api/settings/account/delete", { cache: "no-store" });
      const body = (await response.json()) as DeleteEligibility;
      setEligibility(body);
      setStage(body.eligible ? "ready" : "blocked");
    } catch {
      setError(result.error ?? "Eligibility could not be checked.");
      setStage("idle");
    }
  };

  return (
    <div>
      <SettingsRow
        title="Delete account"
        detail="Deletes settings, connection metadata and revokes sessions"
        action={<SettingsButton onClick={() => void check()} disabled={stage === "checking"}>{stage === "checking" ? "Checking…" : "Delete…"}</SettingsButton>}
      />
      {stage === "blocked" && eligibility ? (
        <p role="status" style={{ fontSize: 13 }}>{eligibility.blockedReason}</p>
      ) : null}
      {stage === "ready" ? (
        <SettingsDangerAction
          title="Confirm deletion"
          detail="This cannot be undone. Subscription state was checked — none active."
          actionLabel="Delete account"
          confirmLabel="Yes, delete everything"
          onConfirm={async () => {
            const result = await postJson("/api/settings/account/delete", { confirm: "DELETE" });
            if (!result.ok) return result.error;
            setStage("done");
            return null;
          }}
        />
      ) : null}
      {stage === "confirming" || stage === "done" ? (
        <p role="status" style={{ fontSize: 13 }}>
          {stage === "done" ? "Account data deleted. You will be signed out." : null}
        </p>
      ) : null}
      {error ? <p role="alert" style={{ fontSize: 13 }}>{error}</p> : null}
    </div>
  );
}

// ── Privacy & data ───────────────────────────────────────────────────────────

export function PrivacySection({ ctx, attachmentsSectionId }: { ctx: SectionCtx; attachmentsSectionId?: string }) {
  const { state, onNavigate } = ctx;
  const settings = useCtxState(ctx);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [exported, setExported] = React.useState(false);

  const runExport = async () => {
    setExporting(true);
    setExportError(null);
    setExported(false);
    try {
      const response = await fetch("/api/settings/privacy/export", { method: "POST" });
      if (!response.ok) {
        setExportError("Export could not be started. Try again.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ethen-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExported(true);
    } catch {
      setExportError("Export could not be started. Check your connection and try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <SettingsSection id="privacy" title="Privacy" meta="What Ethen stores, what leaves, and what you control. Shared.">
      <SettingsGroup label="Privacy information">
        <SettingsRow title="How Ethen protects your data" detail="Settings are scoped to your account (RLS). Secrets and tokens never enter settings or the browser bundle." />
        <SettingsRow title="How Ethen uses your data" detail="Preferences personalize new runs. Model-improvement use is opt-in below and checked server-side." />
        <SettingsRow title="Data retention" detail="Exports, audit entries and connection metadata are kept per deployment policy; deletion requests remove eligible user data." />
      </SettingsGroup>

      <SettingsGroup label="Data preferences">
        <SettingsRow
          id="setting-coarse-location"
          title="Use coarse location metadata"
          detail="City/region level only. Stored as your preference — Chat does not currently enrich requests with location; explicit locations you provide still work."
          action={
            <SettingsToggle
              label="Use coarse location metadata"
              checked={settings.privacy.coarseLocation}
              onChange={(v) => void state.update({ privacy: { ...settings.privacy, coarseLocation: v } })}
            />
          }
        />
        <SettingsRow
          id="setting-model-improvement"
          title="Help improve Ethen models"
          detail="Off means eligible activity is excluded from improvement pipelines. No training pipeline consumes this in the current deployment."
          action={
            <SettingsToggle
              label="Help improve Ethen models"
              checked={settings.privacy.modelImprovement}
              onChange={(v) => void state.update({ privacy: { ...settings.privacy, modelImprovement: v } })}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup label="Export data">
        <SettingsRow
          title="Export my data"
          detail="Settings, connection metadata and recent usage as JSON. Assembled server-side — the page never freezes."
          action={<SettingsButton onClick={() => void runExport()} disabled={exporting}>{exporting ? "Preparing…" : "Export"}</SettingsButton>}
        />
        {exportError ? <p role="alert" style={{ fontSize: 13 }}>{exportError} <button type="button" onClick={() => void runExport()} style={{ textDecoration: "underline", background: "none", border: 0, font: "inherit", cursor: "pointer", color: "inherit" }}>Retry</button></p> : null}
        {exported ? <p role="status" style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>Export downloaded.</p> : null}
      </SettingsGroup>

      <SettingsGroup label="Shared content">
        <SettingsEmptyState message="Nothing is shared. Sharing links are not available in this deployment, so there is nothing to revoke." />
      </SettingsGroup>

      {attachmentsSectionId ? (
        <SettingsGroup label="More">
          <SettingsRow
            title="Uploaded files"
            detail="Chat uploads are managed with attachment preferences"
            action={<SettingsButton onClick={() => onNavigate(attachmentsSectionId)}>Open Attachments</SettingsButton>}
          />
        </SettingsGroup>
      ) : null}
    </SettingsSection>
  );
}

// ── Billing & usage ──────────────────────────────────────────────────────────

export function BillingSection({ ctx }: { ctx: SectionCtx }) {
  const billing = useAsyncData<BillingResponse>("/api/settings/billing");
  const usage = useAsyncData<UsageResponse>("/api/settings/usage");
  const [portalBusy, setPortalBusy] = React.useState(false);
  const [portalError, setPortalError] = React.useState<string | null>(null);

  const openPortal = async () => {
    setPortalBusy(true);
    setPortalError(null);
    const result = await postJson<{ url?: string }>("/api/settings/billing/portal");
    setPortalBusy(false);
    if (!result.ok || !result.data?.url) {
      setPortalError(result.error ?? "Billing portal is unavailable.");
      return;
    }
    window.location.href = result.data.url;
  };

  const b = billing.data;
  const sub = b?.billing?.subscription ?? null;

  return (
    <SettingsSection id="billing" title="Billing & Usage" meta="Plan, payment, invoices and metering. Real data only.">
      {billing.loading ? (
        <p role="status" style={{ fontSize: 13 }}>Loading billing…</p>
      ) : billing.error === "signed_out" ? (
        <p style={{ fontSize: 13 }}>Sign in to see billing.</p>
      ) : billing.error ? (
        <SettingsErrorState message={billing.error} onRetry={() => void billing.refresh()} />
      ) : b && !b.available ? (
        <SettingsEmptyState
          message={b.reason ?? "Billing is unavailable."}
          action={
            <>
              <SettingsButton onClick={() => void billing.refresh()}>Retry</SettingsButton>{" "}
              <a href="/upgrade" style={{ fontSize: 13 }}>
                View plans
              </a>
            </>
          }
        />
      ) : b?.available ? (
        <>
          <SettingsGroup label="Current plan">
            <SettingsRow title="Plan" detail={sub?.planKey ?? "No active plan"} />
            <SettingsRow title="Status" detail={sub?.state ?? "inactive"} />
            <SettingsRow title="Renews" detail={sub?.renewsAt ? formatDate(sub.renewsAt) : "—"} />
            {sub?.cancelAtPeriodEnd ? <SettingsRow title="Cancellation" detail="Cancels at period end" /> : null}
            {(b.billing?.actions?.checkoutOffers?.length ?? 0) > 0 || b.billing?.actions?.portalAvailable ? (
              <SettingsRow
                title="Manage plan"
                detail="Secure Stripe-hosted checkout and portal"
                action={<SettingsButton onClick={() => void openPortal()} disabled={portalBusy || !b.billing?.actions?.portalAvailable} disabledReason="No billing customer yet">{portalBusy ? "Opening…" : "Manage plan"}</SettingsButton>}
              />
            ) : (
              <SettingsRow title="Manage plan" detail="Plan changes are not available for this account" />
            )}
            {portalError ? <p role="alert" style={{ fontSize: 13 }}>{portalError}</p> : null}
            {b.billing?.notice ? <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>{b.billing.notice}</p> : null}
          </SettingsGroup>

          <SettingsGroup label="Payment method">
            <SettingsRow
              title="Payment method"
              detail={b.billing?.actions?.portalAvailable ? "Masked details live in the billing portal — Ethen never handles card numbers" : "No payment method on file"}
              action={
                b.billing?.actions?.portalAvailable ? (
                  <SettingsButton onClick={() => void openPortal()} disabled={portalBusy}>{portalBusy ? "Opening…" : "Open billing portal"}</SettingsButton>
                ) : undefined
              }
            />
          </SettingsGroup>

          <SettingsGroup label="Invoices">
            {b.billing?.actions?.portalAvailable ? (
              <SettingsRow title="Invoices" detail="View and download invoices in the billing portal" action={<SettingsButton onClick={() => void openPortal()} disabled={portalBusy}>Open portal</SettingsButton>} />
            ) : (
              <SettingsEmptyState message="No invoices. Invoices appear here once billing is active." />
            )}
          </SettingsGroup>
        </>
      ) : null}

      <SettingsGroup label="Usage">
        {usage.loading ? (
          <p role="status" style={{ fontSize: 13 }}>Loading usage…</p>
        ) : usage.error === "signed_out" ? (
          <p style={{ fontSize: 13 }}>Sign in to see usage.</p>
        ) : usage.error ? (
          <SettingsErrorState message={usage.error} onRetry={() => void usage.refresh()} />
        ) : usage.data && !usage.data.available ? (
          <SettingsEmptyState message={usage.data.reason ?? "Usage is unavailable."} />
        ) : usage.data?.usage ? (
          <>
            <SettingsRow title="Credit balance" detail={String(usage.data.usage.creditBalance)} />
            {Object.keys(usage.data.usage.byProduct).length > 0 ? (
              <SettingsTable
                caption="Usage by product (only products with real usage)"
                head={["Product", "Events"]}
                rows={Object.entries(usage.data.usage.byProduct).map(([product, count]) => [
                  <span key="p" style={{ fontSize: 12 }}>{product}</span>,
                  <span key="c" style={{ fontSize: 12 }}>{String(count)}</span>,
                ])}
              />
            ) : (
              <SettingsEmptyState message="No usage recorded yet." />
            )}
            {usage.data.usage.quotas ? (
              <SettingsTable
                caption="Enforced quotas"
                head={["Quota", "Limit"]}
                rows={[
                  ["Storage (bytes)", String(usage.data.usage.quotas.maxStorageBytes)],
                  ["Records", String(usage.data.usage.quotas.maxRecords)],
                  ["Leases", String(usage.data.usage.quotas.maxLeases)],
                  ["Requests", String(usage.data.usage.quotas.maxRequests)],
                ].map(([k, v]) => [
                  <span key="k" style={{ fontSize: 12 }}>{k}</span>,
                  <span key="v" style={{ fontSize: 12 }}>{v}</span>,
                ])}
              />
            ) : null}
          </>
        ) : null}
      </SettingsGroup>

      {ctx.state.settings ? (
        <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>
          Usage credits beyond plan and monthly spend caps are not offered in this deployment, so those sections are hidden rather than mocked.
        </p>
      ) : null}
      <SettingsSaveState phase={ctx.state.phase} error={ctx.state.error} persistence={ctx.state.persistence} onRetry={() => void ctx.state.refresh()} />
    </SettingsSection>
  );
}

// ── Capabilities ─────────────────────────────────────────────────────────────

export function CapabilitiesSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const caps = settings.capabilities;

  const set = <K extends keyof typeof caps>(key: K, value: (typeof caps)[K]) =>
    state.update({ capabilities: { ...caps, [key]: value } });

  return (
    <SettingsSection id="capabilities" title="Capabilities" meta="What Ethen may do on your behalf. Every change takes effect.">
      <SettingsRow
        id="setting-tool-access"
        title="Tool access mode"
        detail="On-demand loads tools per request. Stored — Chat does not yet vary tool behavior or confirmations by mode."
        action={
          <span style={{ display: "inline-flex", gap: 4 }} role="radiogroup" aria-label="Tool access mode">
            {(["on-demand", "approved", "ask-sensitive"] as const).map((mode) => (
              <label key={mode} style={{ fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }}>
                <input type="radio" name="tool-access" checked={caps.toolAccessMode === mode} onChange={() => void set("toolAccessMode", mode)} />
                {mode === "on-demand" ? "When needed" : mode === "approved" ? "Approved" : "Ask sensitive"}
              </label>
            ))}
          </span>
        }
      />
      <SettingsRow
        id="setting-connector-discovery"
        title="Search connector directory automatically"
        detail="Off: discovery is manual under Connectors. No automatic suggestions run in Chat yet; stored as your preference."
        action={<SettingsToggle label="Search connector directory automatically" checked={caps.connectorDiscovery} onChange={(v) => void set("connectorDiscovery", v)} />}
      />
      <SettingsRow
        id="setting-safe-fallback"
        title="Allow safe provider fallback"
        detail="Unavailable — no audited fallback policy is configured. Provider failures surface as visible errors with Retry; models never switch silently. The server only crosses providers when this grant is stored on."
        action={<SettingsToggle label="Allow safe provider fallback" checked={false} disabled disabledReason="No audited fallback policy is configured" onChange={() => {}} />}
      />
      <SettingsRow
        id="setting-artifacts"
        title="Artifacts"
        detail="Stored — Chat does not currently gate artifact creation on this setting. Designer build views require artifacts."
        action={<SettingsToggle label="Artifacts" checked={caps.artifacts} onChange={(v) => void set("artifacts", v)} />}
      />
      <SettingsRow
        id="setting-ai-artifacts"
        title="Allow interactive AI inside artifacts"
        detail={caps.artifacts ? "Stored — interactive artifact runs are not yet gated by this in Chat. Sandbox and security policy still apply." : "Requires Artifacts to be on."}
        action={
          <SettingsToggle
            label="Allow interactive AI inside artifacts"
            checked={caps.artifacts && caps.aiArtifacts}
            disabled={!caps.artifacts}
            disabledReason="Turn Artifacts on first"
            onChange={(v) => void set("aiArtifacts", v)}
          />
        }
      />
      <SettingsRow
        id="setting-inline-viz"
        title="Allow inline visualizations"
        detail="Stored — visualization output is not yet produced in Chat responses."
        action={<SettingsToggle label="Allow inline visualizations" checked={caps.inlineVisualizations} onChange={(v) => void set("inlineVisualizations", v)} />}
      />
      {caps.inlineVisualizations ? (
        <div role="img" aria-label="Visualization sample: three bars" style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 56, marginTop: 8 }}>
          {[38, 72, 52].map((h, i) => (
            <span key={i} style={{ width: 28, height: h, background: "var(--eds-lapis, #9497db)", borderRadius: 4 }} />
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>Inline visualizations are off — responses render text and tables only.</p>
      )}
      <SettingsRow
        id="setting-code-execution"
        title="Allow code execution and file creation"
        detail="Off removes the Code tool from new conversations and blocks re-enabling it. Sensitive runs still need approval."
        action={<SettingsToggle label="Allow code execution and file creation" checked={caps.codeExecution} onChange={(v) => void set("codeExecution", v)} />}
      />
    </SettingsSection>
  );
}

// ── Memory & context ─────────────────────────────────────────────────────────

export interface MemoryArea {
  id: string;
  name: string;
  summary: string;
  updated: string | null;
  openHref?: string;
  onDelete?: () => Promise<string | null>;
}

export function MemorySection({
  ctx,
  areas,
  areasLoading,
  areasError,
  onRefreshAreas,
  onImport,
  importLabel,
}: {
  ctx: SectionCtx;
  areas: readonly MemoryArea[];
  areasLoading: boolean;
  areasError: string | null;
  onRefreshAreas: () => void;
  /** Import-memory writer (Chat). Absent in surfaces without an import target. */
  onImport?: (input: { name: string; memories: string[] }) => Promise<string | null>;
  importLabel?: string;
}) {
  const { state } = ctx;
  const settings = useCtxState(ctx);

  return (
    <SettingsSection id="memory" title="Memory" meta="What Ethen remembers and may reference. Shared controls, product scopes.">
      <SettingsRow
        id="setting-search-past"
        title="Search and reference past chats"
        detail="Stored — no retrieval pipeline reads this in Chat yet. History lists show why they are empty."
        action={
          <SettingsToggle
            label="Search and reference past chats"
            checked={settings.memory.searchPastChats}
            onChange={(v) => void state.update({ memory: { ...settings.memory, searchPastChats: v } })}
          />
        }
      />
      <SettingsRow
        id="setting-generate-memory"
        title="Generate memory from my activity"
        detail="Unavailable — no eligible memory-generation pipeline runs in this deployment. Nothing is generated or stored."
        action={<SettingsToggle label="Generate memory from my activity" checked={false} disabled disabledReason="No memory-generation pipeline in this deployment" onChange={() => {}} />}
      />

      <SettingsGroup label="Import memory">
        {onImport ? (
          <MemoryImport onImport={onImport} label={importLabel ?? "Import as a new context area"} />
        ) : (
          <SettingsEmptyState message="Memory import runs in Chat, where imported context lands as a reviewable area before anything is stored." />
        )}
      </SettingsGroup>

      <SettingsGroup label="Memory areas">
        {!settings.memory.searchPastChats ? (
          <SettingsEmptyState message="Past-chat reference is off — areas are hidden until you turn it back on." />
        ) : areasLoading ? (
          <p role="status" style={{ fontSize: 13 }}>Loading areas…</p>
        ) : areasError ? (
          <SettingsErrorState message={areasError} onRetry={onRefreshAreas} />
        ) : areas.length === 0 ? (
          <SettingsEmptyState message="No memory areas yet." />
        ) : (
          <SettingsTable
            caption="Memory areas"
            head={["Area", "Summary", "Updated", ""]}
            rows={areas.map((area) => [
              <span key="n" style={{ fontSize: 12 }}><strong>{area.name}</strong></span>,
              <span key="s" style={{ fontSize: 12 }}>{area.summary}</span>,
              <span key="u" style={{ fontSize: 12 }}>{formatDate(area.updated)}</span>,
              <span key="a" style={{ display: "inline-flex", gap: 8 }}>
                {area.openHref ? <a href={area.openHref} style={{ fontSize: 12 }}>Open</a> : null}
                {area.onDelete ? (
                  <SettingsButton
                    onClick={() => {
                      void area.onDelete!().then(() => onRefreshAreas());
                    }}
                  >
                    Delete
                  </SettingsButton>
                ) : null}
              </span>,
            ])}
          />
        )}
      </SettingsGroup>
    </SettingsSection>
  );
}

function MemoryImport({
  onImport,
  label,
}: {
  onImport: (input: { name: string; memories: string[] }) => Promise<string | null>;
  label: string;
}) {
  const [raw, setRaw] = React.useState("");
  const [preview, setPreview] = React.useState<string[] | null>(null);
  const [name, setName] = React.useState("Imported context");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const parse = () => {
    setError(null);
    setDone(false);
    const text = raw.trim();
    if (!text) {
      setError("Paste an export first — nothing is merged silently.");
      return;
    }
    let items: string[] = [];
    try {
      const parsed: unknown = JSON.parse(text);
      const collect = (value: unknown, depth: number) => {
        if (depth > 4 || items.length >= 50) return;
        if (typeof value === "string" && value.trim().length > 1 && value.trim().length < 500) {
          items.push(value.trim());
          return;
        }
        if (Array.isArray(value)) {
          for (const entry of value) collect(entry, depth + 1);
          return;
        }
        if (value && typeof value === "object") {
          for (const entry of Object.values(value as Record<string, unknown>)) collect(entry, depth + 1);
        }
      };
      collect(parsed, 0);
    } catch {
      items = text.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 1).slice(0, 50);
    }
    if (items.length === 0) {
      setError("No importable memories found in that export.");
      return;
    }
    setPreview(items);
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const problem = await onImport({ name: name.trim() || "Imported context", memories: preview });
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setDone(true);
    setPreview(null);
    setRaw("");
  };

  if (done) return <p role="status" style={{ fontSize: 13 }}>Imported. Review the new area before relying on it.</p>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ fontSize: 12, color: "var(--eds-text-secondary)", margin: 0 }}>
        Paste another provider&apos;s export, review the preview, then confirm. Nothing merges silently.
      </p>
      <SettingsTextarea id="memory-import-raw" label="Provider export (JSON or text)" value={raw} rows={4} onChange={setRaw} />
      <span>
        <SettingsButton onClick={parse}>Preview</SettingsButton>
      </span>
      {error ? <p role="alert" style={{ fontSize: 13 }}>{error}</p> : null}
      {preview ? (
        <>
          <SettingsTextField id="memory-import-name" label="Area name" value={name} onChange={setName} />
          <SettingsTable caption="Import preview — confirm to store" head={["Memory"]} rows={preview.map((item, i) => [<span key={i} style={{ fontSize: 12 }}>{item}</span>])} />
          <span style={{ display: "flex", gap: 8 }}>
            <SettingsButton variant="primary" onClick={() => void confirm()} disabled={busy}>{busy ? "Importing…" : label}</SettingsButton>
            <SettingsButton onClick={() => setPreview(null)}>Cancel</SettingsButton>
          </span>
        </>
      ) : null}
    </div>
  );
}
