import { BUILT_IN_PROVIDERS } from "@ethen/models/metadata";

export type SettingsSectionId =
  | "general"
  | "profile"
  | "models"
  | "repositories"
  | "permissions"
  | "tools"
  | "workflows"
  | "memory"
  | "integrations"
  | "usage"
  | "advanced";

export interface SettingsSectionDefinition {
  id: SettingsSectionId;
  label: string;
  shortLabel: string;
}

export const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  { id: "general", label: "General", shortLabel: "General" },
  { id: "profile", label: "Profile", shortLabel: "Profile" },
  { id: "models", label: "Model & API Keys", shortLabel: "Models" },
  { id: "repositories", label: "Repositories", shortLabel: "Repo" },
  { id: "permissions", label: "Permissions", shortLabel: "Access" },
  { id: "tools", label: "Tools", shortLabel: "Tools" },
  { id: "workflows", label: "Workflows", shortLabel: "Flows" },
  { id: "memory", label: "Memory", shortLabel: "Memory" },
  { id: "integrations", label: "Integrations", shortLabel: "Apps" },
  { id: "usage", label: "Usage", shortLabel: "Usage" },
  { id: "advanced", label: "Advanced", shortLabel: "Advanced" },
];

export type CodingSettingsAccessMode =
  | "chat_only"
  | "read_only"
  | "ask_before_editing"
  | "workspace_write"
  | "full_access";

export const ACCESS_MODE_LABELS: Record<CodingSettingsAccessMode, string> = {
  chat_only: "Chat only",
  read_only: "Read only",
  ask_before_editing: "Ask before editing",
  workspace_write: "Workspace write",
  full_access: "Full access",
};

export const ACCESS_MODE_SHORT_LABELS: Record<CodingSettingsAccessMode, string> = {
  chat_only: "Chat only",
  read_only: "Read only",
  ask_before_editing: "Ask first",
  workspace_write: "Write",
  full_access: "Full",
};

export type CodingSettingsWorkflowMode =
  | "chat"
  | "plan"
  | "build"
  | "review"
  | "debug"
  | "fix_ci"
  | "generate_tests"
  | "explain_repo";

export const WORKFLOW_MODE_LABELS: Record<CodingSettingsWorkflowMode, string> = {
  chat: "Chat",
  plan: "Plan",
  build: "Build",
  review: "Review",
  debug: "Debug/Fix",
  fix_ci: "Fix CI",
  generate_tests: "Generate tests",
  explain_repo: "Explain repo",
};

export const SETTINGS_PROVIDER_CATALOG = [
  {
    id: "ethen-free",
    label: "Ethen free / low-cost models",
    category: "Starter access",
    setupCopy: "Use Ethen-provided free model access when available.",
  },
  {
    id: "byok",
    label: "Bring your own key",
    category: "Setup path",
    setupCopy: "Bring your own key anytime.",
  },
  {
    id: "openai",
    label: "OpenAI",
    category: "Frontier hosted",
    setupCopy: "Server env support exists in the gateway.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    category: "Frontier hosted",
    setupCopy: "Server env support exists in the gateway.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    category: "Low-cost hosted",
    setupCopy: "Wired via the OpenAI-compatible adapter. Set DEEPSEEK_API_KEY; default model deepseek-v4-flash, optional deepseek-v4-pro.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    category: "Router",
    setupCopy: "Shown as a planned OpenAI-compatible provider.",
  },
  {
    id: "groq",
    label: "Groq",
    category: "Low-cost hosted",
    setupCopy: "Not implemented in this repo.",
  },
  {
    id: "together",
    label: "Together",
    category: "Low-cost hosted",
    setupCopy: "Not implemented in this repo.",
  },
  {
    id: "fireworks",
    label: "Fireworks",
    category: "Low-cost hosted",
    setupCopy: "Not implemented in this repo.",
  },
  {
    id: "mistral",
    label: "Mistral",
    category: "Low-cost hosted",
    setupCopy: "Not implemented in this repo.",
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible custom endpoint",
    category: "Custom",
    setupCopy: "Needs base URL and model from env before it can be selected.",
  },
  {
    id: "ollama",
    label: "Ollama / local",
    category: "Local",
    setupCopy: "Local endpoint display only in this repo.",
  },
] as const;

export const BUILT_IN_PROVIDER_META_BY_ID = new Map(
  BUILT_IN_PROVIDERS.map((provider) => [provider.id, provider] as const),
);

export function getSettingsSectionLabel(sectionId: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((section) => section.id === sectionId)?.label ?? "Settings";
}
