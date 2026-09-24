/**
 * Product settings sections: Developer & Runtime, Browser & Computer, Browser
 * Extension, Skills, Connectors, Plugins (shared), Conversation, Voice,
 * Attachments, Tools (Chat), and the ten Designer sections.
 *
 * Same shell, same primitives, same persistence as the shared sections.
 * Anything without a real backend is truthfully disabled — never faked.
 */
"use client";

import * as React from "react";
import type { UserSettings } from "./settings-schema";
import type { UserSettingsState } from "./settings-client";
import {
  SettingsButton,
  SettingsEmptyState,
  SettingsErrorState,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsTable,
  SettingsTextField,
  SettingsToggle,
} from "./settings-shell";
import {
  postJson,
  patchJson,
  deleteJson,
  formatDate,
  useAsyncData,
  type AccountInfo,
  type ConnectorsResponse,
  type SkillsResponse,
} from "./settings-data";
import { CHAT_NATIVE_TOOL_IDS } from "../chat-lab/flagship-launcher";
import { CHAT_TOOLS, THINKING_LEVELS } from "../chat-lab/chat-fixtures";

export interface SectionCtx {
  state: UserSettingsState;
  onNavigate: (sectionId: string) => void;
}

function useCtxState(ctx: SectionCtx): UserSettings {
  return ctx.state.settings;
}

// ── Developer & Runtime ──────────────────────────────────────────────────────

export function DeveloperSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const a = settings.appearance;

  const setA = (patch: Partial<UserSettings["appearance"]>) =>
    state.update({ appearance: { ...a, ...patch } });

  return (
    <SettingsSection id="developer" title="Developer & Runtime" meta="Clients, code presentation and transcript preferences.">
      <SettingsGroup label="Connected developer clients">
        <SettingsEmptyState message="No developer clients connected (Desktop, IDE, CLI, extension, local runtime)." />
        <SettingsRow
          title="Delete remote developer sessions"
          detail="Remote developer sessions are managed by your identity provider"
          action={<SettingsButton disabled disabledReason="No remote developer sessions in this deployment">Delete</SettingsButton>}
        />
      </SettingsGroup>

      <SettingsGroup label="Code appearance">
        <div style={{ display: "grid", gap: 12 }}>
          <SettingsTextField id="dev-light-code" label="Light code theme" value={a.lightCodeTheme} detail="Applies to code blocks, diffs and terminal-like surfaces" onChange={(v) => void setA({ lightCodeTheme: v.slice(0, 80) || "github-light" })} />
          <SettingsTextField id="dev-dark-code" label="Dark code theme" value={a.darkCodeTheme} onChange={(v) => void setA({ darkCodeTheme: v.slice(0, 80) || "github-dark" })} />
          <SettingsTextField id="dev-code-font" label="Code font" value={a.codeFont} detail="Default: IBM Plex Mono" onChange={(v) => void setA({ codeFont: v.slice(0, 80) || "IBM Plex Mono" })} />
        </div>
        <div style={{ marginTop: 12, border: "1px solid var(--eds-rule-hair)", borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 11, color: "var(--eds-text-secondary)", margin: "0 0 8px" }}>Preview</p>
          <pre style={{ fontFamily: `'${a.codeFont}', monospace`, fontSize: 12, margin: 0, overflowX: "auto" }}>
            <code>{`.rail {\n  background: var(--chat-sidebar);\n  width: 272px;\n}`}</code>
          </pre>
        </div>
      </SettingsGroup>

      <SettingsGroup label="Transcript preferences">
        <div style={{ display: "grid", gap: 12 }}>
          <SettingsSelect
            id="dev-content-size"
            label="Transcript text size"
            value={a.contentSize}
            onChange={(v) => void setA({ contentSize: v as UserSettings["appearance"]["contentSize"] })}
            options={[
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" },
            ]}
          />
          <SettingsSelect
            id="dev-content-width"
            label="Transcript width"
            value={a.contentWidth}
            onChange={(v) => void setA({ contentWidth: v as UserSettings["appearance"]["contentWidth"] })}
            options={[
              { value: "narrow", label: "Narrow" },
              { value: "medium", label: "Medium" },
              { value: "wide", label: "Wide" },
            ]}
          />
          <SettingsSelect
            id="dev-reasoning-view"
            label="Default reasoning view"
            value={a.reasoningView}
            detail="Stored — Chat does not yet vary reasoning display by this setting. Summaries never include private chain-of-thought."
            onChange={(v) => void setA({ reasoningView: v as UserSettings["appearance"]["reasoningView"] })}
            options={[
              { value: "normal", label: "Normal" },
              { value: "thinking", label: "Thinking" },
              { value: "verbose", label: "Verbose" },
            ]}
          />
        </div>
        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--eds-rule-hair)",
            borderRadius: 10,
            padding: 12,
            fontSize: a.contentSize === "small" ? 12 : a.contentSize === "large" ? 16 : 14,
            maxWidth: a.contentWidth === "narrow" ? 480 : a.contentWidth === "wide" ? "none" : 680,
          }}
        >
          <p style={{ fontSize: 11, color: "var(--eds-text-secondary)", margin: "0 0 8px" }}>
            Preview · {a.contentSize} · {a.contentWidth} · {a.reasoningView}
          </p>
          <p style={{ margin: 0 }}>The rail recedes one tone below the canvas so the conversation stays the lit surface.</p>
          {a.reasoningView !== "normal" ? (
            <p style={{ margin: "8px 0 0", color: "var(--eds-text-secondary)", fontSize: "0.85em" }}>
              {a.reasoningView === "thinking" ? "Thought: compared rail tones against canvas." : "Thought: compared rail tones against canvas. Checked 8 contrast pairs. Kept hairline borders."}
            </p>
          ) : null}
        </div>
      </SettingsGroup>
    </SettingsSection>
  );
}

// ── Browser & Computer ───────────────────────────────────────────────────────

export function BrowserSection({ ctx }: { ctx: SectionCtx }) {
  const settings = useCtxState(ctx);
  return (
    <SettingsSection id="browser" title="Browser & Computer" meta="Remote-device and browser behavior.">
      <SettingsEmptyState message="No Computer runtime is connected to this deployment. These controls appear when a runtime capability exists — values below are your stored preferences, not live state." />
      <SettingsRow title="Verify new devices before remote connection" detail={`Stored: ${settings.browser.verifyNewDevices ? "on" : "off"}`} action={<SettingsToggle label="Verify new devices" checked={settings.browser.verifyNewDevices} disabled disabledReason="No Computer runtime connected" onChange={() => {}} />} />
      <SettingsRow title="Keep eligible tasks on this computer" detail={`Stored: ${settings.browser.localOnlyTasks ? "on" : "off"}`} action={<SettingsToggle label="Keep eligible tasks on this computer" checked={settings.browser.localOnlyTasks} disabled disabledReason="Local runtime not detected" onChange={() => {}} />} />
      <SettingsRow title="Preferred browser" detail={`Stored: ${settings.browser.preferredBrowser}`} action={<SettingsButton disabled disabledReason="No browser tool runtime connected">Change</SettingsButton>} />
    </SettingsSection>
  );
}

// ── Browser Extension ────────────────────────────────────────────────────────

export function ExtensionSection() {
  return (
    <SettingsSection id="extension" title="Browser Extension" meta="Site permissions for the Ethen extension.">
      <SettingsEmptyState message="No Ethen browser extension is integrated with this deployment, so there are no site permissions to manage." />
      <SettingsRow title="Enable extension" detail="Unavailable — no extension integration" action={<SettingsToggle label="Enable extension" checked={false} disabled disabledReason="No extension integration" onChange={() => {}} />} />
      <SettingsRow title="Default site policy" detail="Ask · Allow · Block — appears with the extension" action={<SettingsButton disabled disabledReason="No extension integration">Change</SettingsButton>} />
    </SettingsSection>
  );
}

// ── Skills ───────────────────────────────────────────────────────────────────

export function SkillsSection({ ctx, product }: { ctx: SectionCtx; product: "chat" | "designer" | "studio" }) {
  const { state } = ctx;
  const skills = useAsyncData<SkillsResponse>("/api/settings/skills");
  const [query, setQuery] = React.useState("");
  const [reviewing, setReviewing] = React.useState<string | null>(null);

  const enablement = skills.data?.enablement ?? {};
  const list = (skills.data?.skills ?? []).filter((skill) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${skill.name} ${skill.description} ${skill.id}`.toLowerCase().includes(q);
  });

  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);
  const patchSkill = async (id: string, patch: { enabled?: boolean; chat?: boolean; designer?: boolean }) => {
    const current = enablement[id] ?? { enabled: true, chat: true, designer: true };
    // CHAT-07: the route implements GET/PATCH (no POST). PATCH carries the
    // same partial body; failures surface per-row instead of silently
    // snapping the switch back.
    const result = await patchJson("/api/settings/skills", { id, ...current, ...patch });
    if (result.ok) {
      if (rowError?.id === id) setRowError(null);
      void skills.refresh();
    } else {
      setRowError({ id, message: result.error ?? "Skill preference could not be saved." });
    }
    return result;
  };

  return (
    <SettingsSection id="skills" title="Skills" meta="Installed skills and discovery. One inventory for Chat and Designer, with per-product enablement.">
      <div style={{ maxWidth: 420, marginBottom: 8 }}>
        <label htmlFor="skills-search" style={{ fontSize: 13, fontWeight: 600 }}>Search skills</label>
        <input id="skills-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search installed skills" style={{ width: "100%", minHeight: 34, marginTop: 4, padding: "0 10px", border: "1px solid var(--eds-rule-hair)", borderRadius: 8, background: "transparent", color: "inherit", font: "inherit", fontSize: 13 }} />
      </div>
      {skills.loading ? (
        <p role="status" style={{ fontSize: 13 }}>Loading skills…</p>
      ) : skills.error === "signed_out" ? (
        <p style={{ fontSize: 13 }}>Sign in to manage skills.</p>
      ) : skills.error ? (
        <SettingsErrorState message={skills.error} onRetry={() => void skills.refresh()} />
      ) : list.length === 0 ? (
        <SettingsEmptyState message={query ? `No skills match “${query}”.` : "No skills ship with this deployment yet."} />
      ) : (
        list.map((skill) => {
          const enabled = enablement[skill.id] ?? { enabled: false, chat: true, designer: true };
          const isReviewing = reviewing === skill.id;
          return (
            <div key={skill.id} style={{ borderBottom: "1px solid var(--eds-rule-hair)", padding: "10px 2px" }}>
              {rowError?.id === skill.id ? (
                <p role="alert" style={{ fontSize: 12, color: "var(--eds-brick)", margin: "0 0 4px" }}>
                  {rowError.message}
                </p>
              ) : null}
              <SettingsRow
                title={`${skill.name} · v${skill.version}`}
                detail={`${skill.description} · ${skill.roles.join(", ") || "general"}`}
                action={
                  <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                    <SettingsButton onClick={() => setReviewing(isReviewing ? null : skill.id)}>
                      {isReviewing ? "Hide" : "Review"}
                    </SettingsButton>
                    <SettingsToggle
                      label={`Enable ${skill.name}`}
                      checked={enabled.enabled}
                      onChange={() => void patchSkill(skill.id, { enabled: !enabled.enabled }).then(() => {
                        void state.refresh();
                      })}
                    />
                  </span>
                }
              />
              {isReviewing ? (
                <div style={{ fontSize: 12, color: "var(--eds-text-secondary)", display: "grid", gap: 4, marginTop: 6 }}>
                  <span>Required tools: {skill.requiredTools.length > 0 ? skill.requiredTools.join(", ") : "none"}</span>
                  <span>Approval gates: {skill.approvals.length > 0 ? `${skill.approvals.length} gate(s)` : "none"}</span>
                  <span>Permissions were reviewed before enabling. Disable anytime — effect is immediate.</span>
                </div>
              ) : null}
              {enabled.enabled ? (
                <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                  <label style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={enabled.chat} onChange={() => void patchSkill(skill.id, { chat: !enabled.chat })} />
                    Chat
                  </label>
                  <label style={{ fontSize: 12, display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={enabled.designer} onChange={() => void patchSkill(skill.id, { designer: !enabled.designer })} />
                    Designer
                  </label>
                  {!(product === "studio" ? (enabled.studio ?? false) : enabled[product]) ? (
                    <small style={{ fontSize: 11, color: "var(--eds-text-secondary)" }}>Off for {product === "chat" ? "Chat" : product === "designer" ? "Designer" : "Studio"} — on elsewhere.</small>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </SettingsSection>
  );
}

// ── Connectors ───────────────────────────────────────────────────────────────

export function ConnectorsSection({ ctx, product }: { ctx: SectionCtx; product: "chat" | "designer" | "studio" }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const connectors = useAsyncData<ConnectorsResponse>("/api/settings/connectors");
  const [filter, setFilter] = React.useState<"all" | "connected" | "not">("all");
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const defs = connectors.data?.connectors ?? [];
  const rows = connectors.data?.connections ?? [];
  const connectedIds = new Set(rows.map((r) => r.provider_id));

  const visible = defs.filter((def) => {
    if (filter === "connected" && !connectedIds.has(def.id)) return false;
    if (filter === "not" && connectedIds.has(def.id)) return false;
    const q = query.trim().toLowerCase();
    if (q && !`${def.displayName} ${def.description} ${def.id}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const connect = async (providerId: string) => {
    setBusy(providerId);
    setError(null);
    const result = await postJson("/api/settings/connectors", { providerId });
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    void connectors.refresh();
  };

  const disconnect = async (id: string) => {
    setBusy(id);
    setError(null);
    const result = await deleteJson(`/api/settings/connectors/${encodeURIComponent(id)}`);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    void connectors.refresh();
  };

  return (
    <SettingsSection id="connectors" title="Connectors" meta={`One registry for Chat and Designer${product === "designer" ? " — Designer-relevant services first" : ""}. OAuth tokens stay server-side.`}>
      {!settings.capabilities.connectorDiscovery ? (
        <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>Automatic connector suggestions are off (Capabilities) — browse manually.</p>
      ) : null}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        {(["all", "connected", "not"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            style={{ border: "1px solid var(--eds-rule-hair)", borderRadius: 999, background: filter === f ? "var(--eds-rule-hair)" : "transparent", color: "inherit", font: "inherit", fontSize: 12, padding: "4px 12px", cursor: "pointer" }}
          >
            {f === "all" ? "All" : f === "connected" ? "Connected" : "Not connected"}
          </button>
        ))}
        <input type="search" aria-label="Search connectors" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" style={{ minHeight: 30, padding: "0 10px", border: "1px solid var(--eds-rule-hair)", borderRadius: 8, background: "transparent", color: "inherit", font: "inherit", fontSize: 12 }} />
      </div>
      {connectors.loading ? (
        <p role="status" style={{ fontSize: 13 }}>Loading connectors…</p>
      ) : connectors.error === "signed_out" ? (
        <p style={{ fontSize: 13 }}>Sign in to manage connectors.</p>
      ) : connectors.error ? (
        <SettingsErrorState message={connectors.error} onRetry={() => void connectors.refresh()} />
      ) : visible.length === 0 ? (
        <SettingsEmptyState message="No connectors match. Connectors you add appear here." />
      ) : (
        visible.map((def) => {
          const mine = rows.filter((r) => r.provider_id === def.id);
          return (
            <div key={def.id} style={{ borderBottom: "1px solid var(--eds-rule-hair)", padding: "10px 2px" }}>
              <SettingsRow
                title={def.displayName}
                detail={`${def.description} · ${def.statusDetail}`}
                action={
                  mine.length > 0 ? (
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <small style={{ fontSize: 11, color: "var(--eds-text-secondary)" }}>{mine[0].status}</small>
                      <SettingsButton onClick={() => void disconnect(mine[0].id)} disabled={busy === mine[0].id}>
                        {busy === mine[0].id ? "Working…" : "Disconnect"}
                      </SettingsButton>
                    </span>
                  ) : (
                    <SettingsButton onClick={() => void connect(def.id)} disabled={busy === def.id}>
                      {busy === def.id ? "Working…" : "Connect"}
                    </SettingsButton>
                  )
                }
              />
              {mine.length > 0 ? (
                <div style={{ fontSize: 11, color: "var(--eds-text-secondary)" }}>
                  Scopes: {mine[0].scopes_granted.length > 0 ? mine[0].scopes_granted.join(", ") : "none granted yet"} · connected {formatDate(mine[0].created_at)}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--eds-text-secondary)" }}>
                  Capabilities: {def.capabilities.slice(0, 4).map((c) => c.label).join(", ") || "—"}
                </div>
              )}
            </div>
          );
        })
      )}
      {error ? <p role="alert" style={{ fontSize: 13 }}>{error}</p> : null}
      <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>Shared with {product === "chat" ? "Designer" : "Chat"} — one connection, both products. State: {state.persistence === "server" ? "synced" : "this browser"}.</p>
    </SettingsSection>
  );
}

// ── Plugins ──────────────────────────────────────────────────────────────────

export function PluginsSection() {
  return (
    <SettingsSection id="plugins" title="Plugins" meta="Extend Ethen with reviewed plugins.">
      <SettingsEmptyState message="No plugin registry ships with this deployment. This section appears when installable plugins exist — nothing is mocked in the meantime." />
    </SettingsSection>
  );
}

// ── Chat: Conversation ───────────────────────────────────────────────────────

export function ConversationSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const account = useAsyncData<AccountInfo>("/api/settings/account");
  const projects = useAsyncData<{ ok: boolean; projects: { id: string; name: string }[] }>("/api/projects");

  return (
    <SettingsSection id="conversation" title="Conversation" meta="Defaults for new Chat conversations. The model lane stays fixed.">
      <SettingsRow title="Chat model" detail={account.data?.model ?? "Loading…"} />
      <SettingsRow title="Model selection" detail="Chat runs one fixed model. Full model selection lives in Ethen Platform." />
      <SettingsSelect
        id="chat-response-style"
        label="Default response style"
        value={settings.chat.responseStyle}
        onChange={(v) => void state.update({ chat: { ...settings.chat, responseStyle: v } })}
        options={[
          { value: "balanced", label: "Balanced" },
          { value: "concise", label: "Concise" },
          { value: "detailed", label: "Detailed" },
        ]}
      />
      <SettingsSelect
        id="chat-reasoning-visibility"
        label="Default reasoning visibility"
        value={settings.appearance.reasoningView}
        detail="Stored — Chat does not yet vary reasoning display by this setting. Summaries never include private chain-of-thought."
        onChange={(v) => void state.update({ appearance: { ...settings.appearance, reasoningView: v as UserSettings["appearance"]["reasoningView"] } })}
        options={[
          { value: "normal", label: "Normal" },
          { value: "thinking", label: "Thinking" },
          { value: "verbose", label: "Verbose" },
        ]}
      />
      <SettingsRow
        title="Auto-title conversations"
        detail="New conversations get titles automatically"
        action={<SettingsToggle label="Auto-title conversations" checked={settings.chat.autoTitle} onChange={(v) => void state.update({ chat: { ...settings.chat, autoTitle: v } })} />}
      />
      <SettingsSelect
        id="chat-default-project"
        label="Default project"
        value={settings.chat.defaultProject}
        detail="Stored — Chat does not yet file new conversations into the default project automatically"
        onChange={(v) => void state.update({ chat: { ...settings.chat, defaultProject: v } })}
        options={[
          { value: "", label: "None" },
          ...((projects.data?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))),
        ]}
      />
      <SettingsRow title="Conversation history" detail="Reference and retention are governed by Memory" action={<SettingsButton onClick={() => ctx.onNavigate("memory")}>Open Memory</SettingsButton>} />
    </SettingsSection>
  );
}

// ── Chat: Voice ──────────────────────────────────────────────────────────────

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
}

export function VoiceSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const [inputs, setInputs] = React.useState<MediaDeviceInfo[] | null>(null);
  const [outputs, setOutputs] = React.useState<MediaDeviceInfo[] | null>(null);
  const [deviceError, setDeviceError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    async function enumerate() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          if (active) setDeviceError("This browser does not expose media devices.");
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        setInputs(devices.filter((d) => d.kind === "audioinput").map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` })));
        setOutputs(devices.filter((d) => d.kind === "audiooutput").map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${i + 1}` })));
      } catch {
        if (active) setDeviceError("Microphone/speaker list needs permission — grant it to choose defaults.");
      }
    }
    void enumerate();
    return () => {
      active = false;
    };
  }, []);

  return (
    <SettingsSection id="voice" title="Voice" meta="Voice input and playback. Real devices, honest availability.">
      <SettingsRow title="Voice" detail="Voice input is not available in Chat yet" action={<SettingsButton disabled disabledReason="Voice input is not available in Chat yet">Enable</SettingsButton>} />
      {deviceError ? <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>{deviceError}</p> : null}
      <SettingsSelect
        id="voice-input"
        label="Input device"
        detail="Stored — the voice engine currently uses system devices."
        value={settings.chat.inputDevice}
        onChange={(v) => void state.update({ chat: { ...settings.chat, inputDevice: v } })}
        options={[{ value: "", label: "System default" }, ...((inputs ?? []).map((d) => ({ value: d.deviceId, label: d.label })))]}
      />
      <SettingsSelect
        id="voice-output"
        label="Output device"
        detail="Stored — the voice engine currently uses system devices."
        value={settings.chat.outputDevice}
        onChange={(v) => void state.update({ chat: { ...settings.chat, outputDevice: v } })}
        options={[{ value: "", label: "System default" }, ...((outputs ?? []).map((d) => ({ value: d.deviceId, label: d.label })))]}
      />
      <SettingsRow title="Auto-play responses" detail="Unavailable until voice ships" action={<SettingsToggle label="Auto-play responses" checked={false} disabled disabledReason="Voice is not available in Chat yet" onChange={() => {}} />} />
      <SettingsRow title="Interrupt behavior" detail="Unavailable until voice ships" action={<SettingsButton disabled disabledReason="Voice is not available in Chat yet">Change</SettingsButton>} />
    </SettingsSection>
  );
}

// ── Chat: Attachments ────────────────────────────────────────────────────────

export function AttachmentsSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  return (
    <SettingsSection id="attachments" title="Attachments" meta="Upload defaults and server-enforced limits.">
      <SettingsSelect
        id="chat-upload-behavior"
        label="Default upload behavior"
        value={settings.chat.uploadBehavior}
        detail="Uploads land in private project storage and are only read back for your own requests. The selected behavior is stored; uploads are not yet routed automatically."
        onChange={(v) => void state.update({ chat: { ...settings.chat, uploadBehavior: v } })}
        options={[
          { value: "private", label: "Private project storage" },
          { value: "project", label: "Attach to default project", disabled: !settings.chat.defaultProject, disabledReason: "Set a default project under Conversation first" },
        ]}
      />
      <SettingsGroup label="Server-enforced limits">
        <SettingsRow title="Max file size" detail="5 MiB — larger files are rejected" />
        <SettingsRow title="Type checks" detail="Extension, MIME and magic bytes must agree" />
        <SettingsRow title="Content admission" detail="Uploads pass content admission before storage" />
      </SettingsGroup>
      <SettingsGroup label="Recent uploads">
        <SettingsEmptyState message="Recent uploads appear in the conversation where they were attached." />
      </SettingsGroup>
    </SettingsSection>
  );
}

// ── Chat: Tools ──────────────────────────────────────────────────────────────

const LEGACY_CHAT_KEY = "ethen.chat.settings.v1";
const LEGACY_CHAT_EVENT = "ethen:chat-settings";

/** Mirror thinking/tools into the legacy key so the live /chat shell (which reads it) follows new defaults. */
function mirrorLegacy(thinking: string, tools: string[]) {
  try {
    window.localStorage.setItem(LEGACY_CHAT_KEY, JSON.stringify({ thinking, tools }));
    window.dispatchEvent(new CustomEvent(LEGACY_CHAT_EVENT, { detail: { thinking, tools } }));
  } catch {
    /* legacy mirror best-effort */
  }
}

export function ToolsSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const [arming, setArming] = React.useState<string | null>(null);
  const askSensitive = settings.capabilities.toolAccessMode === "ask-sensitive";
  const codeAllowed = settings.capabilities.codeExecution;
  const nativeTools = CHAT_TOOLS.filter((tool) => CHAT_NATIVE_TOOL_IDS.includes(tool.id));

  const setTools = (next: string[]) => {
    void state.update({ chat: { ...settings.chat, tools: next } }).then((ok) => {
      if (ok) mirrorLegacy(settings.chat.thinking, next);
    });
  };

  const toggleTool = (id: string, on: boolean) => {
    const sensitive = id === "code" || id === "computer";
    if (on && askSensitive && sensitive && arming !== id) {
      setArming(id);
      return;
    }
    setArming(null);
    const next = on ? [...settings.chat.tools, id] : settings.chat.tools.filter((entry) => entry !== id);
    setTools(next);
  };

  return (
    <SettingsSection id="tools" title="Tools" meta="Chat-native tools enabled for new conversations. Every tool executes on request.">
      <SettingsGroup label="Default intelligence">
        <div role="radiogroup" aria-label="Default intelligence">
          {THINKING_LEVELS.map((level) => (
            <SettingsRow
              key={level}
              title={level}
              action={
                <input
                  type="radio"
                  name="chat-thinking"
                  aria-label={level}
                  checked={settings.chat.thinking === level}
                  onChange={() => {
                    void state.update({ chat: { ...settings.chat, thinking: level } }).then((ok) => {
                      if (ok) mirrorLegacy(level, [...settings.chat.tools]);
                    });
                  }}
                />
              }
            />
          ))}
        </div>
      </SettingsGroup>
      <SettingsGroup label="Default tools">
        {nativeTools.map((tool) => {
          const checked = settings.chat.tools.includes(tool.id);
          return (
            <SettingsRow
              key={tool.id}
              title={tool.name}
              detail={
                arming === tool.id
                  ? "Sensitive tool — activate again to confirm"
                  : tool.detail
              }
              action={
                <input
                  type="checkbox"
                  aria-label={tool.name}
                  checked={checked}
                  onChange={(e) => toggleTool(tool.id, e.target.checked)}
                />
              }
            />
          );
        })}
        <SettingsRow
          title="Code"
          detail={
            codeAllowed
              ? "Available via code mode — refused with an honest error when the capability is off"
              : "Disabled by Capabilities — code tools and code mode are refused server-side"
          }
          action={<SettingsButton onClick={() => ctx.onNavigate("capabilities")}>Capabilities</SettingsButton>}
        />
      </SettingsGroup>
      <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>
        Defaults apply to new conversations and sync to the live Chat shell. Flagship launcher links are navigation, not tool permissions.
      </p>
    </SettingsSection>
  );
}

// ── Designer sections ────────────────────────────────────────────────────────

export interface DesignerData {
  status: { configured?: boolean; state?: string; message?: string } | null;
  statusError: string | null;
  usage: import("./settings-data").UsageResponse | null;
  connectionCount: number;
  githubConnected: boolean;
  documents: { id: string; title: string; updatedAt: string | null }[];
  documentsError: string | null;
}

export function DesignerGeneralSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const d = settings.designer;
  const set = (patch: Partial<UserSettings["designer"]>) => state.update({ designer: { ...d, ...patch } });

  return (
    <SettingsSection id="dgeneral" title="General" meta="Project defaults. They seed the next creation form.">
      <SettingsSelect id="dg-type" label="Default project type" value={d.defaultProjectType} onChange={(v) => void set({ defaultProjectType: v })} options={["web", "site", "app", "dashboard", "landing"].map((v) => ({ value: v, label: v }))} />
      <SettingsSelect id="dg-template" label="Default template" value={d.defaultTemplate} onChange={(v) => void set({ defaultTemplate: v })} options={["blank", "saas", "portfolio", "docs", "storefront"].map((v) => ({ value: v, label: v }))} />
      <SettingsTextField id="dg-system" label="Default design system" value={d.defaultDesignSystem} onChange={(v) => void set({ defaultDesignSystem: v.slice(0, 64) })} />
      <SettingsRow title="Auto-save" detail="Edits persist to the open document" action={<SettingsToggle label="Auto-save" checked={d.autoSave} onChange={(v) => void set({ autoSave: v })} />} />
      <SettingsRow title="Open generated project automatically" detail="After generation, open the project instead of staying on New design" action={<SettingsToggle label="Open generated project automatically" checked={d.openAfterGeneration} onChange={(v) => void set({ openAfterGeneration: v })} />} />
    </SettingsSection>
  );
}

export function DesignerAccessSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const d = settings.designer;
  const set = (patch: Partial<UserSettings["designer"]>) => state.update({ designer: { ...d, ...patch } });

  return (
    <SettingsSection id="access" title="Access" meta="Who can open Designer work.">
      <SettingsSelect
        id="da-visibility"
        label="Project visibility default"
        value={d.projectVisibility}
        detail="Sharing beyond private is unavailable — collaborations stay private"
        onChange={(v) => void set({ projectVisibility: v as UserSettings["designer"]["projectVisibility"] })}
        options={[
          { value: "private", label: "Private" },
          { value: "share", label: "Share-preview", disabled: true, disabledReason: "Sharing is unavailable in this version" },
        ]}
      />
      <SettingsSelect
        id="da-share"
        label="Share-link default"
        value={d.shareLinkDefault}
        onChange={(v) => void set({ shareLinkDefault: v as UserSettings["designer"]["shareLinkDefault"] })}
        options={[
          { value: "private", label: "Private" },
          { value: "share", label: "Share-preview", disabled: true, disabledReason: "Sharing is unavailable in this version" },
        ]}
      />
      <SettingsRow title="Collaborator permissions" detail="Not available — only you can open Designer workspaces" action={<SettingsButton disabled disabledReason="Members and roles are not available in this version">Manage</SettingsButton>} />
    </SettingsSection>
  );
}

export function DesignerRuntimeSection({ ctx, data }: { ctx: SectionCtx; data: DesignerData }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const d = settings.designer;
  const set = (patch: Partial<UserSettings["designer"]>) => state.update({ designer: { ...d, ...patch } });

  return (
    <SettingsSection id="runtime" title="Runtime & Preview" meta="Live readiness plus preview defaults.">
      <SettingsRow title="Status" detail={data.status?.message ?? data.statusError ?? "Checking runtime…"} />
      <SettingsRow title="State" detail={data.status?.state ?? "unknown"} />
      <SettingsRow title="Runtime provider" detail="Centrally managed" action={<SettingsButton disabled disabledReason="Provider is centrally managed">Change</SettingsButton>} />
      <SettingsSelect id="dr-privacy" label="Preview privacy" value={d.previewPrivacy} onChange={(v) => void set({ previewPrivacy: v as UserSettings["designer"]["previewPrivacy"] })} options={[{ value: "private", label: "Private" }, { value: "share", label: "Share", disabled: true, disabledReason: "Sharing is unavailable" }]} />
      <SettingsRow title="Auto-start preview" detail="Start the preview when a project opens" action={<SettingsToggle label="Auto-start preview" checked={d.autoStartPreview} onChange={(v) => void set({ autoStartPreview: v })} />} />
      <SettingsSelect id="dr-idle" label="Idle timeout" value={String(d.idleTimeoutMinutes)} onChange={(v) => void set({ idleTimeoutMinutes: Number(v) })} options={["15", "30", "60", "120"].map((v) => ({ value: v, label: `${v} minutes` }))} />
      <SettingsRow title="Network / egress" detail="Managed policy — no custom egress rules in this deployment" />
    </SettingsSection>
  );
}

export function DesignerGitSection({ ctx, data }: { ctx: SectionCtx; data: DesignerData }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const d = settings.designer;
  const set = (patch: Partial<UserSettings["designer"]>) => state.update({ designer: { ...d, ...patch } });

  return (
    <SettingsSection id="git" title="Source & Git" meta="Repository binding via the shared GitHub connector. No tokens ever shown.">
      <SettingsRow title="Repository connection" detail={data.githubConnected ? "GitHub connected — see Connections" : "Not connected — connect GitHub under Connections"} action={<SettingsButton onClick={() => ctx.onNavigate("connections")}>Open Connections</SettingsButton>} />
      <SettingsTextField id="dg-branch" label="Default branch" value={d.defaultBranch} onChange={(v) => void set({ defaultBranch: v.slice(0, 128) || "main" })} />
      <SettingsSelect id="dg-commit" label="Commit behavior" value={d.commitBehavior} onChange={(v) => void set({ commitBehavior: v })} options={[{ value: "checkpoint", label: "Checkpoint per change" }, { value: "manual", label: "Manual commits" }]} />
      <SettingsRow title="Sync status" detail="Immutable version lineage lives on each document workspace history" />
    </SettingsSection>
  );
}

export function DesignerEnvSection() {
  return (
    <SettingsSection id="env" title="Environment" meta="Names and status only — values never shown, never sent to the browser.">
      <SettingsTable
        caption="Environment references"
        head={["Name", "Scope", "Status"]}
        rows={[
          ["LOCAL_PREVIEW", "preview", "Configured"],
          ["DESIGN_STORE", "local file-store", "Configured"],
        ].map(([k, s, v]) => [
          <code key="k" style={{ fontSize: 12 }}>{k}</code>,
          <span key="s" style={{ fontSize: 12 }}>{s}</span>,
          <span key="v" style={{ fontSize: 12 }}>{v}</span>,
        ])}
      />
      <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>
        Secret values are write-only after creation and live server-side only. Environment editing is not available in this version.
      </p>
      <SettingsRow title="Edit values" detail="Environment editing is not available in this version" action={<SettingsButton disabled disabledReason="Environment editing is not available in this version">Edit</SettingsButton>} />
    </SettingsSection>
  );
}

export function DesignerConnectionsSection({ ctx, data }: { ctx: SectionCtx; data: DesignerData }) {
  return (
    <SettingsSection id="connections" title="Connections" meta="Designer-relevant services from the shared registry.">
      <SettingsRow title="Connected services" detail={data.connectionCount > 0 ? `${data.connectionCount} connection(s) — manage under Connectors` : "None yet — connect GitHub, Vercel, Supabase or Figma under Connectors"} action={<SettingsButton onClick={() => ctx.onNavigate("connectors")}>Open Connectors</SettingsButton>} />
      <p style={{ fontSize: 12, color: "var(--eds-text-secondary)" }}>One registry, both products. Tokens stay server-side.</p>
    </SettingsSection>
  );
}

export function DesignerSecuritySection() {
  return (
    <SettingsSection id="security" title="Security" meta="Isolation, egress and approvals.">
      <SettingsRow title="Runtime isolation" detail="Enforced by the managed runtime" />
      <SettingsRow title="Allowed domains / egress" detail="Managed policy — no custom rules in this deployment" />
      <SettingsRow title="Secret handling" detail="Write-only after creation, server-side only" />
      <SettingsRow title="Project access" detail="Private — only you can open Designer workspaces" />
      <SettingsRow title="Destructive-action approvals" detail="Locked on — production changes always need explicit authorization" action={<SettingsToggle label="Destructive-action approvals" checked disabled disabledReason="Required — cannot be turned off" onChange={() => {}} />} />
    </SettingsSection>
  );
}

const GATE_LABELS: Record<string, string> = {
  build: "Build",
  preview: "Preview",
  console: "Console",
  network: "Network",
  journeys: "Journeys",
  visual: "Visual",
  accessibility: "Accessibility",
  hash: "Hash consistency",
};

export function DesignerVerificationSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const d = settings.designer;

  return (
    <SettingsSection id="verification" title="Verification" meta="The 8-gate Designer model. VERIFIED needs all eight passing — required gates stay locked on.">
      <SettingsRow title="Run verification automatically" detail="After each generation, run the gate suite" action={<SettingsToggle label="Run verification automatically" checked={d.autoVerify} onChange={(v) => void state.update({ designer: { ...d, autoVerify: v } })} />} />
      <SettingsTable
        caption="Verification gates (all required)"
        head={["Gate", "Required", "Enabled"]}
        rows={Object.entries(GATE_LABELS).map(([id, label]) => [
          <span key="g" style={{ fontSize: 12 }}>{label}</span>,
          <span key="r" style={{ fontSize: 12 }}>Yes</span>,
          <span key="e" style={{ fontSize: 12 }}>
            <SettingsToggle label={`${label} gate`} checked disabled disabledReason="Required gate — cannot be turned off while keeping VERIFIED" onChange={() => {}} />
          </span>,
        ])}
      />
    </SettingsSection>
  );
}

export function DesignerUsageSection({ data }: { data: DesignerData }) {
  const usageResp = data.usage;
  const usage = usageResp?.usage;
  return (
    <SettingsSection id="dusage" title="Usage & Billing" meta="Designer consumption plus enforced quotas. Aggregates into shared Billing & Usage.">
      {!usageResp ? (
        <SettingsEmptyState message="Sign in to see Designer usage." />
      ) : !usageResp.available || !usage ? (
        <SettingsEmptyState message={usageResp.reason ?? "Usage unavailable."} />
      ) : (
        <>
          <SettingsRow title="Storage" detail={usage.storage ?? "local file-store"} />
          {usage.quotas ? (
            <SettingsTable
              caption="Project quotas"
              head={["Quota", "Limit"]}
              rows={[
                ["Storage (bytes)", String(usage.quotas.maxStorageBytes)],
                ["Records", String(usage.quotas.maxRecords)],
                ["Leases", String(usage.quotas.maxLeases)],
                ["Requests", String(usage.quotas.maxRequests)],
              ].map(([k, v]) => [
                <span key="k" style={{ fontSize: 12 }}>{k}</span>,
                <span key="v" style={{ fontSize: 12 }}>{v}</span>,
              ])}
            />
          ) : null}
          {usage.byProduct && Object.keys(usage.byProduct).length > 0 ? (
            <SettingsTable
              caption="Usage by product"
              head={["Product", "Events"]}
              rows={Object.entries(usage.byProduct).map(([product, count]) => [
                <span key="p" style={{ fontSize: 12 }}>{product}</span>,
                <span key="c" style={{ fontSize: 12 }}>{String(count)}</span>,
              ])}
            />
          ) : (
            <SettingsEmptyState message="No Designer usage recorded yet." />
          )}
        </>
      )}
    </SettingsSection>
  );
}

export function DesignerDeploymentSection({ ctx }: { ctx: SectionCtx }) {
  const { state } = ctx;
  const settings = useCtxState(ctx);
  const d = settings.designer;

  return (
    <SettingsSection id="deployment" title="Deployment" meta="Provider binding and deploy behavior. Public changes always need explicit authorization.">
      <SettingsRow title="Deployment provider" detail="Vercel · production direction" />
      <SettingsRow title="Automatic deploys" detail="Never without explicit approval in this deployment" action={<SettingsToggle label="Automatic deploys" checked={false} disabled disabledReason="Automatic production deploys are not offered" onChange={() => {}} />} />
      <SettingsRow
        title="Deployment protection"
        detail="Locked on — destructive or public production changes require explicit authorization"
        action={<SettingsToggle label="Deployment protection" checked disabled disabledReason="Required — cannot be turned off" onChange={() => {}} />}
      />
      <SettingsSelect id="dd-provider" label="Provider binding note" value={d.deploymentProvider} onChange={(v) => void state.update({ designer: { ...d, deploymentProvider: v } })} options={[{ value: "vercel", label: "Vercel" }]} />
    </SettingsSection>
  );
}

// ── Studio (V3 Job 1 — prefs persist now, effects connect in Job 4) ───────────

export interface StudioData {
  prefs: import("./studio-settings").StudioSettings;
  save: (next: import("./studio-settings").StudioSettings) => string | null;
}

const STUDIO_PENDING = "Saved locally · applied live to Studio generation and views.";

export function StudioGenerationSection({ data }: { data: StudioData }) {
  const { prefs, save } = data;
  const g = prefs.generation;
  return (
    <SettingsSection id="generation" title="Generation" meta={`Image defaults. ${STUDIO_PENDING}`}>
      <SettingsSelect id="sg-quality" label="Default quality" value={g.defaultQuality} detail={STUDIO_PENDING} onChange={(v) => save({ ...prefs, generation: { ...g, defaultQuality: v as typeof g.defaultQuality } })} options={["draft", "standard", "high"].map((v) => ({ value: v, label: v }))} />
      <SettingsTextField id="sg-steps" label="Steps (1–50)" value={String(g.steps)} detail={STUDIO_PENDING} onChange={(v) => save({ ...prefs, generation: { ...g, steps: Number(v) } })} />
      <SettingsTextField id="sg-guidance" label="Guidance (0–20)" value={String(g.guidance)} detail={STUDIO_PENDING} onChange={(v) => save({ ...prefs, generation: { ...g, guidance: Number(v) } })} />
      <SettingsRow title="Lock seed" detail={`Reuse the last seed for comparable runs. ${STUDIO_PENDING}`} action={<SettingsToggle label="Lock seed" checked={g.lockSeed} onChange={(v) => save({ ...prefs, generation: { ...g, lockSeed: v } })} />} />
    </SettingsSection>
  );
}

export function StudioRoutingSection({ data }: { data: StudioData }) {
  const { prefs, save } = data;
  const r = prefs.routing;
  return (
    <SettingsSection id="routing" title="Routing" meta={`Provider selection and fallback. ${STUDIO_PENDING}`}>
      <SettingsSelect id="sr-provider" label="Preferred provider" value={r.preferredProvider} detail={STUDIO_PENDING} onChange={(v) => save({ ...prefs, routing: { ...r, preferredProvider: v as typeof r.preferredProvider } })} options={["auto", "fal", "replicate", "local"].map((v) => ({ value: v, label: v }))} />
      <SettingsRow title="Allow fallback" detail={`Try the next provider when the preferred one fails. ${STUDIO_PENDING}`} action={<SettingsToggle label="Allow fallback" checked={r.allowFallback} onChange={(v) => save({ ...prefs, routing: { ...r, allowFallback: v } })} />} />
      <SettingsSelect id="sr-priority" label="Queue priority" value={r.queuePriority} detail={STUDIO_PENDING} onChange={(v) => save({ ...prefs, routing: { ...r, queuePriority: v as typeof r.queuePriority } })} options={["standard", "high"].map((v) => ({ value: v, label: v }))} />
    </SettingsSection>
  );
}

export function StudioAssetsSection({ data }: { data: StudioData }) {
  const { prefs, save } = data;
  const a = prefs.assets;
  return (
    <SettingsSection id="assets" title="Assets" meta={`Library retention. ${STUDIO_PENDING}`}>
      <SettingsSelect id="sa-retention" label="Retention" value={String(a.retentionDays)} detail={STUDIO_PENDING} onChange={(v) => save({ ...prefs, assets: { ...a, retentionDays: Number(v) as typeof a.retentionDays } })} options={["7", "30", "90", "365"].map((v) => ({ value: v, label: `${v} days` }))} />
      <SettingsRow title="Keep versions" detail={`Retain prior versions of edited assets. ${STUDIO_PENDING}`} action={<SettingsToggle label="Keep versions" checked={a.keepVersions} onChange={(v) => save({ ...prefs, assets: { ...a, keepVersions: v } })} />} />
    </SettingsSection>
  );
}

export function StudioVideoSection({ data }: { data: StudioData }) {
  const { prefs, save } = data;
  const v = prefs.video;
  return (
    <SettingsSection id="video" title="Video" meta={`Video defaults. ${STUDIO_PENDING}`}>
      <SettingsSelect id="sv-resolution" label="Default resolution" value={v.defaultResolution} detail={STUDIO_PENDING} onChange={(opt) => save({ ...prefs, video: { ...v, defaultResolution: opt as typeof v.defaultResolution } })} options={["720p", "1080p", "4k"].map((o) => ({ value: o, label: o }))} />
      <SettingsSelect id="sv-fps" label="Frame rate" value={String(v.defaultFps)} detail={STUDIO_PENDING} onChange={(opt) => save({ ...prefs, video: { ...v, defaultFps: Number(opt) as typeof v.defaultFps } })} options={["24", "30", "60"].map((o) => ({ value: o, label: `${o} fps` }))} />
      <SettingsRow title="Captions" detail={`Generate captions for video outputs. ${STUDIO_PENDING}`} action={<SettingsToggle label="Captions" checked={v.captions} onChange={(val) => save({ ...prefs, video: { ...v, captions: val } })} />} />
    </SettingsSection>
  );
}

export function StudioExportSection({ data }: { data: StudioData }) {
  const { prefs, save } = data;
  const e = prefs.export;
  return (
    <SettingsSection id="export" title="Export" meta={`Download defaults. ${STUDIO_PENDING}`}>
      <SettingsSelect id="se-format" label="Default format" value={e.defaultFormat} detail={STUDIO_PENDING} onChange={(v) => save({ ...prefs, export: { ...e, defaultFormat: v as typeof e.defaultFormat } })} options={["png", "jpg", "webp", "mp4"].map((v) => ({ value: v, label: v }))} />
      <SettingsTextField id="se-quality" label="Quality (1–100)" value={String(e.quality)} detail={STUDIO_PENDING} onChange={(v) => save({ ...prefs, export: { ...e, quality: Number(v) } })} />
      <SettingsRow title="Watermark" detail={`Stamp exports with the workspace mark. ${STUDIO_PENDING}`} action={<SettingsToggle label="Watermark" checked={e.watermark} onChange={(v) => save({ ...prefs, export: { ...e, watermark: v } })} />} />
    </SettingsSection>
  );
}

export function StudioKeyboardSection({ data }: { data: StudioData }) {
  const { prefs, save } = data;
  const k = prefs.keyboard;
  return (
    <SettingsSection id="keyboard" title="Keyboard" meta={`Shortcut behavior. ${STUDIO_PENDING}`}>
      <SettingsRow title="Keyboard shortcuts" detail={`⌘/Ctrl+K search, ⌘/Ctrl+N new, Escape closes, arrows resize the rail. ${STUDIO_PENDING}`} action={<SettingsToggle label="Keyboard shortcuts" checked={k.shortcutsEnabled} onChange={(v) => save({ ...prefs, keyboard: { ...k, shortcutsEnabled: v } })} />} />
    </SettingsSection>
  );
}
