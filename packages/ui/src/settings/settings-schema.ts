/**
 * Shared Ethen settings schema — single typed preference model for Chat + Designer.
 *
 * Ownership: `packages/ui` (shared settings authority per the Settings spec).
 * Every persisted value is namespaced by section; Chat-only values live under
 * `chat.*`, Designer-only values under `designer.*`, everything else is shared
 * and consumed by both apps. Secrets, tokens, payment data and environment
 * secret VALUES never belong here — they live in their dedicated secure
 * services and are only ever referenced by name.
 */

/** Every setting declares exactly one owner (spec §2). */
export type SettingOwner =
  | "SHARED_ACCOUNT"
  | "SHARED_UI"
  | "SHARED_PRIVACY"
  | "SHARED_BILLING"
  | "SHARED_CAPABILITY"
  | "SHARED_MEMORY"
  | "SHARED_INTEGRATION"
  | "CHAT"
  | "DESIGNER"
  | "PLATFORM";

export type ThemePreference = "light" | "dark" | "system";
export type MotionPreference = "system" | "full" | "reduced";
export type DensityPreference = "comfortable" | "compact";
export type ContentSize = "small" | "medium" | "large";
export type ContentWidth = "narrow" | "medium" | "wide";
export type ReasoningView = "normal" | "thinking" | "verbose";
export type ToolAccessMode = "on-demand" | "approved" | "ask-sensitive";
export type PreviewPrivacy = "private" | "share";
export type SitePolicy = "ask" | "allow" | "block";
export type PreferredBrowser = "builtin" | "chrome" | "system";

export interface GeneralSettings {
  fullName: string;
  preferredName: string;
  workRole: string;
  instructions: string;
  avatarUrl: string;
  /** BCP-47 locale, e.g. "en-US". Only shipped locales are selectable. */
  locale: string;
}

export interface AppearanceSettings {
  theme: ThemePreference;
  interfaceFont: string;
  contentFont: string;
  codeFont: string;
  lightCodeTheme: string;
  darkCodeTheme: string;
  motion: MotionPreference;
  density: DensityPreference;
  contentSize: ContentSize;
  contentWidth: ContentWidth;
  reasoningView: ReasoningView;
}

export interface PrivacySettings {
  coarseLocation: boolean;
  modelImprovement: boolean;
}

export interface CapabilitySettings {
  toolAccessMode: ToolAccessMode;
  connectorDiscovery: boolean;
  safeFallback: boolean;
  artifacts: boolean;
  aiArtifacts: boolean;
  inlineVisualizations: boolean;
  codeExecution: boolean;
}

export interface MemorySettings {
  searchPastChats: boolean;
  generateMemory: boolean;
}

export interface ChatSettingsSection {
  responseStyle: string;
  autoTitle: boolean;
  defaultProject: string;
  voiceAutoPlay: boolean;
  voice: string;
  inputDevice: string;
  outputDevice: string;
  interruptBehavior: string;
  uploadBehavior: string;
  /** Chat-native tool ids enabled by default for new conversations. */
  tools: string[];
  /** Default intelligence level for new conversations. */
  thinking: string;
}

export interface VerificationGates {
  build: boolean;
  preview: boolean;
  console: boolean;
  network: boolean;
  journeys: boolean;
  visual: boolean;
  accessibility: boolean;
  hash: boolean;
}

export interface DesignerSettingsSection {
  defaultProjectType: string;
  defaultTemplate: string;
  defaultDesignSystem: string;
  autoSave: boolean;
  openAfterGeneration: boolean;
  projectVisibility: PreviewPrivacy;
  shareLinkDefault: PreviewPrivacy;
  runtimeProvider: string;
  previewPrivacy: PreviewPrivacy;
  autoStartPreview: boolean;
  idleTimeoutMinutes: number;
  restartBehavior: string;
  defaultBranch: string;
  commitBehavior: string;
  autoVerify: boolean;
  gates: VerificationGates;
  deploymentProvider: string;
  autoDeploy: boolean;
  deploymentProtection: boolean;
}

export interface SkillEnablement {
  enabled: boolean;
  chat: boolean;
  designer: boolean;
  /** Studio V3 Job 1 — Studio enablement (optional until Job 4 connects effects). */
  studio?: boolean;
}

export interface BrowserSettings {
  verifyNewDevices: boolean;
  localOnlyTasks: boolean;
  preferredBrowser: PreferredBrowser;
}

export interface ExtensionSettings {
  enabled: boolean;
  defaultSitePolicy: SitePolicy;
  sites: Record<string, SitePolicy>;
}

export interface UserSettings {
  version: number;
  general: GeneralSettings;
  appearance: AppearanceSettings;
  privacy: PrivacySettings;
  capabilities: CapabilitySettings;
  memory: MemorySettings;
  browser: BrowserSettings;
  extension: ExtensionSettings;
  skills: Record<string, SkillEnablement>;
  plugins: Record<string, boolean>;
  chat: ChatSettingsSection;
  designer: DesignerSettingsSection;
}

export const SETTINGS_VERSION = 1;

/** Canonical defaults — shared by Chat, Designer, server validation and tests. */
export const DEFAULT_SETTINGS: UserSettings = {
  version: SETTINGS_VERSION,
  general: {
    fullName: "",
    preferredName: "",
    workRole: "",
    instructions: "",
    avatarUrl: "",
    locale: "en-US",
  },
  appearance: {
    theme: "system",
    interfaceFont: "Instrument Sans",
    contentFont: "Newsreader",
    codeFont: "IBM Plex Mono",
    lightCodeTheme: "github-light",
    darkCodeTheme: "github-dark",
    motion: "system",
    density: "comfortable",
    contentSize: "medium",
    contentWidth: "medium",
    reasoningView: "normal",
  },
  privacy: {
    coarseLocation: true,
    modelImprovement: false,
  },
  capabilities: {
    toolAccessMode: "on-demand",
    connectorDiscovery: true,
    safeFallback: false,
    artifacts: true,
    aiArtifacts: false,
    inlineVisualizations: true,
    codeExecution: true,
  },
  memory: {
    searchPastChats: true,
    generateMemory: false,
  },
  browser: {
    verifyNewDevices: true,
    localOnlyTasks: false,
    preferredBrowser: "builtin",
  },
  extension: {
    enabled: false,
    defaultSitePolicy: "ask",
    sites: {},
  },
  skills: {},
  plugins: {},
  chat: {
    responseStyle: "balanced",
    autoTitle: true,
    defaultProject: "",
    voiceAutoPlay: false,
    voice: "",
    inputDevice: "",
    outputDevice: "",
    interruptBehavior: "pause",
    uploadBehavior: "private",
    tools: [],
    thinking: "Think",
  },
  designer: {
    defaultProjectType: "web",
    defaultTemplate: "blank",
    defaultDesignSystem: "eds",
    autoSave: true,
    openAfterGeneration: true,
    projectVisibility: "private",
    shareLinkDefault: "private",
    runtimeProvider: "managed",
    previewPrivacy: "private",
    autoStartPreview: true,
    idleTimeoutMinutes: 30,
    restartBehavior: "manual",
    defaultBranch: "main",
    commitBehavior: "checkpoint",
    autoVerify: true,
    gates: {
      build: true,
      preview: true,
      console: true,
      network: true,
      journeys: true,
      visual: true,
      accessibility: true,
      hash: true,
    },
    deploymentProvider: "vercel",
    autoDeploy: false,
    deploymentProtection: true,
  },
};

/** Length caps for free-text profile fields (server revalidates). */
export const SETTINGS_LIMITS = {
  fullName: 120,
  preferredName: 60,
  workRole: 120,
  instructions: 4000,
  responseStyle: 120,
} as const;

// ── Validation (dependency-free so server + client share it) ─────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback: string, max = 4000): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback === "" ? "" : trimmed || fallback;
  return trimmed.slice(0, max);
}

function optStr(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").slice(0, 64);
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Validate + sanitize an unknown payload into a full UserSettings document.
 * Unknown fields are dropped; invalid values fall back to defaults. Never throws.
 */
export function validateUserSettings(input: unknown): UserSettings {
  const d = DEFAULT_SETTINGS;
  if (!isRecord(input)) return structuredCloneFallback(d);
  const g = isRecord(input.general) ? input.general : {};
  const a = isRecord(input.appearance) ? input.appearance : {};
  const p = isRecord(input.privacy) ? input.privacy : {};
  const c = isRecord(input.capabilities) ? input.capabilities : {};
  const m = isRecord(input.memory) ? input.memory : {};
  const b = isRecord(input.browser) ? input.browser : {};
  const e = isRecord(input.extension) ? input.extension : {};
  const ch = isRecord(input.chat) ? input.chat : {};
  const dg = isRecord(input.designer) ? input.designer : {};
  const gates = isRecord(dg.gates) ? dg.gates : {};

  const skills: Record<string, SkillEnablement> = {};
  if (isRecord(input.skills)) {
    for (const [id, entry] of Object.entries(input.skills).slice(0, 256)) {
      if (!isRecord(entry)) continue;
      const key = id.slice(0, 128);
      if (!key) continue;
      skills[key] = {
        enabled: bool(entry.enabled, true),
        chat: bool(entry.chat, true),
        designer: bool(entry.designer, true),
      };
    }
  }
  const plugins: Record<string, boolean> = {};
  if (isRecord(input.plugins)) {
    for (const [id, entry] of Object.entries(input.plugins).slice(0, 256)) {
      if (typeof entry !== "boolean") continue;
      const key = id.slice(0, 128);
      if (key) plugins[key] = entry;
    }
  }
  const sites: Record<string, SitePolicy> = {};
  if (isRecord(e.sites)) {
    for (const [domain, policy] of Object.entries(e.sites).slice(0, 256)) {
      if (policy !== "ask" && policy !== "allow" && policy !== "block") continue;
      const key = domain.slice(0, 128);
      if (key) sites[key] = policy;
    }
  }

  return {
    version: SETTINGS_VERSION,
    general: {
      fullName: optStr(g.fullName, SETTINGS_LIMITS.fullName),
      preferredName: optStr(g.preferredName, SETTINGS_LIMITS.preferredName),
      workRole: optStr(g.workRole, SETTINGS_LIMITS.workRole),
      instructions: optStr(g.instructions, SETTINGS_LIMITS.instructions),
      avatarUrl: optStr(g.avatarUrl, 2048),
      locale: str(g.locale, d.general.locale, 16),
    },
    appearance: {
      theme: oneOf(a.theme, ["light", "dark", "system"] as const, d.appearance.theme),
      interfaceFont: str(a.interfaceFont, d.appearance.interfaceFont, 80),
      contentFont: str(a.contentFont, d.appearance.contentFont, 80),
      codeFont: str(a.codeFont, d.appearance.codeFont, 80),
      lightCodeTheme: str(a.lightCodeTheme, d.appearance.lightCodeTheme, 80),
      darkCodeTheme: str(a.darkCodeTheme, d.appearance.darkCodeTheme, 80),
      motion: oneOf(a.motion, ["system", "full", "reduced"] as const, d.appearance.motion),
      density: oneOf(a.density, ["comfortable", "compact"] as const, d.appearance.density),
      contentSize: oneOf(a.contentSize, ["small", "medium", "large"] as const, d.appearance.contentSize),
      contentWidth: oneOf(a.contentWidth, ["narrow", "medium", "wide"] as const, d.appearance.contentWidth),
      reasoningView: oneOf(a.reasoningView, ["normal", "thinking", "verbose"] as const, d.appearance.reasoningView),
    },
    privacy: {
      coarseLocation: bool(p.coarseLocation, d.privacy.coarseLocation),
      modelImprovement: bool(p.modelImprovement, d.privacy.modelImprovement),
    },
    capabilities: {
      toolAccessMode: oneOf(
        c.toolAccessMode,
        ["on-demand", "approved", "ask-sensitive"] as const,
        d.capabilities.toolAccessMode,
      ),
      connectorDiscovery: bool(c.connectorDiscovery, d.capabilities.connectorDiscovery),
      safeFallback: bool(c.safeFallback, d.capabilities.safeFallback),
      artifacts: bool(c.artifacts, d.capabilities.artifacts),
      aiArtifacts: bool(c.aiArtifacts, d.capabilities.aiArtifacts),
      inlineVisualizations: bool(c.inlineVisualizations, d.capabilities.inlineVisualizations),
      codeExecution: bool(c.codeExecution, d.capabilities.codeExecution),
    },
    memory: {
      searchPastChats: bool(m.searchPastChats, d.memory.searchPastChats),
      generateMemory: bool(m.generateMemory, d.memory.generateMemory),
    },
    browser: {
      verifyNewDevices: bool(b.verifyNewDevices, d.browser.verifyNewDevices),
      localOnlyTasks: bool(b.localOnlyTasks, d.browser.localOnlyTasks),
      preferredBrowser: oneOf(b.preferredBrowser, ["builtin", "chrome", "system"] as const, d.browser.preferredBrowser),
    },
    extension: {
      enabled: bool(e.enabled, d.extension.enabled),
      defaultSitePolicy: oneOf(e.defaultSitePolicy, ["ask", "allow", "block"] as const, d.extension.defaultSitePolicy),
      sites,
    },
    skills,
    plugins,
    chat: {
      responseStyle: str(ch.responseStyle, d.chat.responseStyle, SETTINGS_LIMITS.responseStyle),
      autoTitle: bool(ch.autoTitle, d.chat.autoTitle),
      defaultProject: optStr(ch.defaultProject, 128),
      voiceAutoPlay: bool(ch.voiceAutoPlay, d.chat.voiceAutoPlay),
      voice: optStr(ch.voice, 128),
      inputDevice: optStr(ch.inputDevice, 128),
      outputDevice: optStr(ch.outputDevice, 128),
      interruptBehavior: str(ch.interruptBehavior, d.chat.interruptBehavior, 64),
      uploadBehavior: str(ch.uploadBehavior, d.chat.uploadBehavior, 64),
      tools: strArray(ch.tools),
      thinking: str(ch.thinking, d.chat.thinking, 32),
    },
    designer: {
      defaultProjectType: str(dg.defaultProjectType, d.designer.defaultProjectType, 64),
      defaultTemplate: str(dg.defaultTemplate, d.designer.defaultTemplate, 64),
      defaultDesignSystem: str(dg.defaultDesignSystem, d.designer.defaultDesignSystem, 64),
      autoSave: bool(dg.autoSave, d.designer.autoSave),
      openAfterGeneration: bool(dg.openAfterGeneration, d.designer.openAfterGeneration),
      projectVisibility: oneOf(dg.projectVisibility, ["private", "share"] as const, d.designer.projectVisibility),
      shareLinkDefault: oneOf(dg.shareLinkDefault, ["private", "share"] as const, d.designer.shareLinkDefault),
      runtimeProvider: str(dg.runtimeProvider, d.designer.runtimeProvider, 64),
      previewPrivacy: oneOf(dg.previewPrivacy, ["private", "share"] as const, d.designer.previewPrivacy),
      autoStartPreview: bool(dg.autoStartPreview, d.designer.autoStartPreview),
      idleTimeoutMinutes: num(dg.idleTimeoutMinutes, d.designer.idleTimeoutMinutes, 5, 480),
      restartBehavior: str(dg.restartBehavior, d.designer.restartBehavior, 64),
      defaultBranch: str(dg.defaultBranch, d.designer.defaultBranch, 128),
      commitBehavior: str(dg.commitBehavior, d.designer.commitBehavior, 64),
      autoVerify: bool(dg.autoVerify, d.designer.autoVerify),
      gates: {
        build: bool(gates.build, true),
        preview: bool(gates.preview, true),
        console: bool(gates.console, true),
        network: bool(gates.network, true),
        journeys: bool(gates.journeys, true),
        visual: bool(gates.visual, true),
        accessibility: bool(gates.accessibility, true),
        hash: bool(gates.hash, true),
      },
      deploymentProvider: str(dg.deploymentProvider, d.designer.deploymentProvider, 64),
      autoDeploy: bool(dg.autoDeploy, d.designer.autoDeploy),
      deploymentProtection: bool(dg.deploymentProtection, d.designer.deploymentProtection),
    },
  };
}

function structuredCloneFallback(value: UserSettings): UserSettings {
  return JSON.parse(JSON.stringify(value)) as UserSettings;
}

export type SettingsPatch = Partial<UserSettings>;

/**
 * Deep-merge a partial patch onto base settings and revalidate, so partial
 * PATCH bodies can never corrupt the document. Unknown keys are dropped.
 */
export function applySettingsPatch(base: UserSettings, patch: unknown): UserSettings {
  if (!isRecord(patch)) return base;
  const merged: Record<string, unknown> = {};
  for (const section of [
    "general",
    "appearance",
    "privacy",
    "capabilities",
    "memory",
    "browser",
    "extension",
    "skills",
    "plugins",
    "chat",
    "designer",
  ] as const) {
    const baseSection = (base[section] ?? {}) as Record<string, unknown>;
    const patchSection = patch[section];
    if (section === "skills" || section === "plugins") {
      merged[section] = isRecord(patchSection)
        ? { ...(baseSection as Record<string, unknown>), ...patchSection }
        : baseSection;
    } else if (section === "extension") {
      const baseExt = baseSection as Record<string, unknown>;
      const patchExt = isRecord(patchSection) ? patchSection : {};
      merged[section] = {
        ...baseExt,
        ...patchExt,
        sites: isRecord(patchExt.sites)
          ? { ...((baseExt.sites ?? {}) as Record<string, unknown>), ...patchExt.sites }
          : baseExt.sites,
      };
    } else if (section === "designer") {
      const baseD = baseSection as Record<string, unknown>;
      const patchD = isRecord(patchSection) ? patchSection : {};
      merged[section] = {
        ...baseD,
        ...patchD,
        gates: isRecord(patchD.gates)
          ? { ...((baseD.gates ?? {}) as Record<string, unknown>), ...patchD.gates }
          : baseD.gates,
      };
    } else {
      merged[section] = isRecord(patchSection) ? { ...baseSection, ...patchSection } : baseSection;
    }
  }
  return validateUserSettings({ ...merged, version: SETTINGS_VERSION });
}

// ── Ownership registry (spec §2) ─────────────────────────────────────────────

/** Dot-path → owner for every persisted setting. */
export const SETTING_OWNERS: Readonly<Record<string, SettingOwner>> = {
  "general.fullName": "SHARED_ACCOUNT",
  "general.preferredName": "SHARED_ACCOUNT",
  "general.workRole": "SHARED_ACCOUNT",
  "general.instructions": "SHARED_ACCOUNT",
  "general.avatarUrl": "SHARED_ACCOUNT",
  "general.locale": "SHARED_UI",
  "appearance.theme": "SHARED_UI",
  "appearance.interfaceFont": "SHARED_UI",
  "appearance.contentFont": "SHARED_UI",
  "appearance.codeFont": "SHARED_UI",
  "appearance.lightCodeTheme": "SHARED_UI",
  "appearance.darkCodeTheme": "SHARED_UI",
  "appearance.motion": "SHARED_UI",
  "appearance.density": "SHARED_UI",
  "appearance.contentSize": "SHARED_UI",
  "appearance.contentWidth": "SHARED_UI",
  "appearance.reasoningView": "SHARED_UI",
  "privacy.coarseLocation": "SHARED_PRIVACY",
  "privacy.modelImprovement": "SHARED_PRIVACY",
  "capabilities.toolAccessMode": "SHARED_CAPABILITY",
  "capabilities.connectorDiscovery": "SHARED_CAPABILITY",
  "capabilities.safeFallback": "SHARED_CAPABILITY",
  "capabilities.artifacts": "SHARED_CAPABILITY",
  "capabilities.aiArtifacts": "SHARED_CAPABILITY",
  "capabilities.inlineVisualizations": "SHARED_CAPABILITY",
  "capabilities.codeExecution": "SHARED_CAPABILITY",
  "memory.searchPastChats": "SHARED_MEMORY",
  "memory.generateMemory": "SHARED_MEMORY",
  "browser.verifyNewDevices": "SHARED_INTEGRATION",
  "browser.localOnlyTasks": "SHARED_INTEGRATION",
  "browser.preferredBrowser": "SHARED_INTEGRATION",
  "extension.enabled": "SHARED_INTEGRATION",
  "extension.defaultSitePolicy": "SHARED_INTEGRATION",
  "extension.sites": "SHARED_INTEGRATION",
  "skills": "SHARED_INTEGRATION",
  "plugins": "SHARED_INTEGRATION",
  "chat.responseStyle": "CHAT",
  "chat.autoTitle": "CHAT",
  "chat.defaultProject": "CHAT",
  "chat.voiceAutoPlay": "CHAT",
  "chat.voice": "CHAT",
  "chat.inputDevice": "CHAT",
  "chat.outputDevice": "CHAT",
  "chat.interruptBehavior": "CHAT",
  "chat.uploadBehavior": "CHAT",
  "chat.tools": "CHAT",
  "chat.thinking": "CHAT",
  "designer.defaultProjectType": "DESIGNER",
  "designer.defaultTemplate": "DESIGNER",
  "designer.defaultDesignSystem": "DESIGNER",
  "designer.autoSave": "DESIGNER",
  "designer.openAfterGeneration": "DESIGNER",
  "designer.projectVisibility": "DESIGNER",
  "designer.shareLinkDefault": "DESIGNER",
  "designer.runtimeProvider": "DESIGNER",
  "designer.previewPrivacy": "DESIGNER",
  "designer.autoStartPreview": "DESIGNER",
  "designer.idleTimeoutMinutes": "DESIGNER",
  "designer.restartBehavior": "DESIGNER",
  "designer.defaultBranch": "DESIGNER",
  "designer.commitBehavior": "DESIGNER",
  "designer.autoVerify": "DESIGNER",
  "designer.gates": "DESIGNER",
  "designer.deploymentProvider": "DESIGNER",
  "designer.autoDeploy": "DESIGNER",
  "designer.deploymentProtection": "DESIGNER",
};

export function ownerOfSetting(path: string): SettingOwner {
  return SETTING_OWNERS[path] ?? "PLATFORM";
}

// ── Locales (only shipped translations are selectable) ───────────────────────

export interface SettingsLocale {
  code: string;
  label: string;
  available: boolean;
  unavailableReason?: string;
}

/**
 * Language architecture target (spec §3.3). Only locales with shipped
 * application strings are selectable; the rest are listed disabled so the
 * architecture is visible but never promises what it cannot do.
 */
export const SETTINGS_LOCALES: readonly SettingsLocale[] = [
  { code: "en-US", label: "English (US)", available: true },
  { code: "en-GB", label: "English (UK)", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "fr", label: "French", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "de", label: "German", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "hi", label: "Hindi", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "id", label: "Indonesian", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "it", label: "Italian", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "ja", label: "Japanese", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "ko", label: "Korean", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "pt-BR", label: "Portuguese (Brazil)", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "es-419", label: "Spanish (Latin America)", available: false, unavailableReason: "Translation not shipped yet" },
  { code: "es-ES", label: "Spanish (Spain)", available: false, unavailableReason: "Translation not shipped yet" },
];

export function isLocaleAvailable(code: string): boolean {
  return SETTINGS_LOCALES.some((locale) => locale.code === code && locale.available);
}
