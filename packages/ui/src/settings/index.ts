/**
 * `@ethen/ui/settings` — shared Ethen settings authority for Chat + Designer.
 *
 * Apps import from `@ethen/ui/settings/*` and must NOT implement their own
 * shell, nav, search, primitives, schema or sync client:
 *
 *   apps/chat-core -> @ethen/ui/settings = GOOD
 *   apps/designer  -> @ethen/ui/settings = GOOD
 */

export {
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
  SETTINGS_LOCALES,
  SETTING_OWNERS,
  SETTINGS_VERSION,
  applySettingsPatch,
  isLocaleAvailable,
  ownerOfSetting,
  validateUserSettings,
} from "./settings-schema";
export type {
  AppearanceSettings,
  BrowserSettings,
  CapabilitySettings,
  ChatSettingsSection,
  ContentSize,
  ContentWidth,
  DensityPreference,
  DesignerSettingsSection,
  ExtensionSettings,
  GeneralSettings,
  MemorySettings,
  MotionPreference,
  PreferredBrowser,
  PreviewPrivacy,
  PrivacySettings,
  ReasoningView,
  SettingOwner,
  SettingsPatch,
  SitePolicy,
  SkillEnablement,
  ThemePreference,
  ToolAccessMode,
  UserSettings,
  VerificationGates,
  SettingsLocale,
} from "./settings-schema";

export {
  CHAT_SECTIONS,
  CUSTOMIZE_GROUP_LABEL,
  DESIGNER_SECTIONS,
  SHARED_SECTIONS,
  STUDIO_SECTIONS,
  buildSettingsSearchIndex,
  searchSettings,
  sectionsForProduct,
} from "./settings-sections";
export type {
  SettingsGroup as SettingsNavGroup,
  SettingsProduct,
  SettingsSearchEntry,
  SettingsSectionDef,
} from "./settings-sections";

export {
  SETTINGS_LOCAL_KEY,
  SETTINGS_SYNC_EVENT,
  UserSettingsProvider,
  applyAppearance,
  fetchRemoteSettings,
  loadLocalSettings,
  patchRemoteSettings,
  saveLocalSettings,
  useUserSettings,
} from "./settings-client";
export type {
  RemoteSettingsResponse,
  SettingsPersistence,
  SettingsPhase,
  UserSettingsState,
} from "./settings-client";

export {
  AccountMenu,
} from "./account-menu";
export type { AccountMenuIdentity, AccountMenuItem } from "./account-menu";

export {
  SettingsButton,
  SettingsDangerAction,
  SettingsEmptyState,
  SettingsErrorState,
  SettingsGroup,
  SettingsRow,
  SettingsSaveState,
  SettingsSection,
  SettingsSelect,
  SettingsShell,
  SettingsTable,
  SettingsTextarea,
  SettingsTextField,
  SettingsToggle,
} from "./settings-shell";
export type { SettingsShellProps, ShellSection } from "./settings-shell";

export {
  deleteJson,
  formatDate,
  postJson,
  useAsyncData,
} from "./settings-data";
export type {
  AccountInfo,
  AsyncData,
  BillingResponse,
  ConnectorConnection,
  ConnectorDef,
  ConnectorsResponse,
  DeleteEligibility,
  SessionInfo,
  SessionsResponse,
  SkillPackInfo,
  SkillsResponse,
  UsageResponse,
} from "./settings-data";

export {
  AccountSection,
  BillingSection,
  CapabilitiesSection,
  GeneralSection,
  MemorySection,
  PrivacySection,
} from "./settings-shared-sections";
export type { MemoryArea, SectionCtx } from "./settings-shared-sections";

export {
  AttachmentsSection,
  BrowserSection,
  ConnectorsSection,
  ConversationSection,
  DesignerAccessSection,
  DesignerConnectionsSection,
  DesignerDeploymentSection,
  DesignerEnvSection,
  DesignerGeneralSection,
  DesignerGitSection,
  DesignerRuntimeSection,
  DesignerSecuritySection,
  DesignerUsageSection,
  DesignerVerificationSection,
  DeveloperSection,
  ExtensionSection,
  PluginsSection,
  SkillsSection,
  StudioAssetsSection,
  StudioExportSection,
  StudioGenerationSection,
  StudioKeyboardSection,
  StudioRoutingSection,
  StudioVideoSection,
  ToolsSection,
  VoiceSection,
} from "./settings-product-sections";
export type { DesignerData, StudioData } from "./settings-product-sections";

export {
  DEFAULT_STUDIO_SETTINGS,
  STUDIO_SETTINGS_EVENT,
  STUDIO_SETTINGS_STORAGE_KEY,
  STUDIO_SETTINGS_VERSION,
  getStudioSettingsServerSnapshot,
  getStudioSettingsSnapshot,
  loadStudioSettings,
  saveStudioSettings,
  subscribeStudioSettings,
  validateStudioSettings,
} from "./studio-settings";
export type {
  StudioAssetsPrefs,
  StudioExportFormat,
  StudioExportPrefs,
  StudioGenerationPrefs,
  StudioKeyboardPrefs,
  StudioProvider,
  StudioQuality,
  StudioQueuePriority,
  StudioRetentionDays,
  StudioRoutingPrefs,
  StudioSettings,
  StudioVideoFps,
  StudioVideoPrefs,
  StudioVideoResolution,
} from "./studio-settings";
