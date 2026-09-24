/**
 * Canonical settings information architecture (spec §6) + shared search index
 * (spec §17). One nav definition consumed by Chat and Designer; product
 * sections layer on top of the shared sections, never fork them.
 */

export type SettingsProduct = "shared" | "chat" | "designer" | "studio";
export type SettingsGroup = "shared" | "customize" | "chat" | "designer" | "studio";

export interface SettingsSectionDef {
  id: string;
  label: string;
  group: SettingsGroup;
  product: SettingsProduct;
  keywords: string[];
}

/** Shared top-level sections — identical order in Chat and Designer. */
export const SHARED_SECTIONS: readonly SettingsSectionDef[] = [
  { id: "general", label: "General", group: "shared", product: "shared", keywords: ["profile", "name", "avatar", "role", "instructions", "appearance", "theme", "font", "motion", "density", "language", "locale"] },
  { id: "account", label: "Account", group: "shared", product: "shared", keywords: ["logout", "sign out", "devices", "sessions", "delete account", "account id", "organization", "trusted"] },
  { id: "privacy", label: "Privacy", group: "shared", product: "shared", keywords: ["data", "location", "model improvement", "training", "export", "shared chats", "artifacts", "files", "uploads", "feedback"] },
  { id: "billing", label: "Billing & Usage", group: "shared", product: "shared", keywords: ["plan", "subscription", "payment", "invoice", "usage", "credits", "spend limit", "renewal", "entitlements"] },
  { id: "capabilities", label: "Capabilities", group: "shared", product: "shared", keywords: ["tools", "connector discovery", "fallback", "artifacts", "visualizations", "code execution", "sandbox"] },
  { id: "memory", label: "Memory", group: "shared", product: "shared", keywords: ["memory", "context", "past chats", "history", "import", "areas", "scopes"] },
  { id: "developer", label: "Developer & Runtime", group: "shared", product: "shared", keywords: ["developer", "clients", "cli", "ide", "scopes", "revoke", "code theme", "transcript", "reasoning", "thinking"] },
  { id: "browser", label: "Browser & Computer", group: "shared", product: "shared", keywords: ["browser", "computer", "remote", "device verification", "local tasks", "chrome"] },
  { id: "extension", label: "Browser Extension", group: "shared", product: "shared", keywords: ["extension", "site policy", "permissions", "allow", "block"] },
  { id: "skills", label: "Skills", group: "customize", product: "shared", keywords: ["skills", "discover", "install", "enable", "configure"] },
  { id: "connectors", label: "Connectors", group: "customize", product: "shared", keywords: ["connectors", "integrations", "github", "google drive", "gmail", "slack", "oauth", "connect"] },
  { id: "plugins", label: "Plugins", group: "customize", product: "shared", keywords: ["plugins", "publisher", "permissions", "install"] },
];

/** Chat-specific extension sections. */
export const CHAT_SECTIONS: readonly SettingsSectionDef[] = [
  { id: "conversation", label: "Conversation", group: "chat", product: "chat", keywords: ["conversation", "response style", "reasoning", "auto-title", "history", "project"] },
  { id: "voice", label: "Voice", group: "chat", product: "chat", keywords: ["voice", "microphone", "input device", "output device", "autoplay", "interrupt"] },
  { id: "attachments", label: "Attachments", group: "chat", product: "chat", keywords: ["attachments", "uploads", "files", "recent"] },
  { id: "tools", label: "Tools", group: "chat", product: "chat", keywords: ["tools", "web", "code", "computer", "image", "research"] },
];

/** Designer-specific extension sections. */
export const DESIGNER_SECTIONS: readonly SettingsSectionDef[] = [
  { id: "dgeneral", label: "General", group: "designer", product: "designer", keywords: ["project type", "template", "design system", "auto-save", "open after generation"] },
  { id: "access", label: "Access", group: "designer", product: "designer", keywords: ["visibility", "share", "collaborators", "permissions"] },
  { id: "runtime", label: "Runtime & Preview", group: "designer", product: "designer", keywords: ["runtime", "preview", "provider", "idle timeout", "restart", "network", "egress"] },
  { id: "git", label: "Source & Git", group: "designer", product: "designer", keywords: ["git", "repository", "branch", "commit", "sync", "github"] },
  { id: "env", label: "Environment", group: "designer", product: "designer", keywords: ["environment", "variables", "secrets", "preview", "production"] },
  { id: "connections", label: "Connections", group: "designer", product: "designer", keywords: ["connections", "github", "vercel", "supabase", "figma", "storage"] },
  { id: "security", label: "Security", group: "designer", product: "designer", keywords: ["security", "isolation", "egress", "domains", "approvals"] },
  { id: "verification", label: "Verification", group: "designer", product: "designer", keywords: ["verification", "gates", "build", "preview", "console", "network", "journeys", "visual", "accessibility", "hash"] },
  { id: "dusage", label: "Usage & Billing", group: "designer", product: "designer", keywords: ["usage", "runtime minutes", "sandbox", "storage", "quota", "qwen"] },
  { id: "deployment", label: "Deployment", group: "designer", product: "designer", keywords: ["deployment", "deploy", "provider", "preview", "production", "alias", "protection"] },
];

/** Studio V3 Job 1 — Studio extension sections (preferences land here; Job 4 connects effects). */
export const STUDIO_SECTIONS: readonly SettingsSectionDef[] = [
  { id: "generation", label: "Generation", group: "studio", product: "studio", keywords: ["generation", "model", "quality", "steps", "guidance", "seed"] },
  { id: "routing", label: "Routing", group: "studio", product: "studio", keywords: ["routing", "provider", "fallback", "queue", "priority"] },
  { id: "assets", label: "Assets", group: "studio", product: "studio", keywords: ["assets", "storage", "retention", "versions", "trash"] },
  { id: "video", label: "Video", group: "studio", product: "studio", keywords: ["video", "resolution", "fps", "duration", "captions"] },
  { id: "export", label: "Export", group: "studio", product: "studio", keywords: ["export", "format", "quality", "watermark", "download"] },
  { id: "keyboard", label: "Keyboard", group: "studio", product: "studio", keywords: ["keyboard", "shortcuts", "hotkeys"] },
];

export const CUSTOMIZE_GROUP_LABEL = "Customize";

/** Full nav for a product: shared sections + product extension. */
export function sectionsForProduct(product: "chat" | "designer" | "studio"): SettingsSectionDef[] {
  if (product === "chat") return [...SHARED_SECTIONS, ...CHAT_SECTIONS];
  if (product === "designer") return [...SHARED_SECTIONS, ...DESIGNER_SECTIONS];
  return [...SHARED_SECTIONS, ...STUDIO_SECTIONS];
}

// ── Search (spec §17 — index holds section metadata only, never secrets) ─────

export interface SettingsSearchEntry {
  sectionId: string;
  label: string;
  group: SettingsGroup;
  product: SettingsProduct;
  keywords: string[];
}

export function buildSettingsSearchIndex(product: "chat" | "designer" | "studio"): SettingsSearchEntry[] {
  return sectionsForProduct(product).map((section) => ({
    sectionId: section.id,
    label: section.label,
    group: section.group,
    product: section.product,
    keywords: section.keywords,
  }));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Filter the settings index by free text. Matches against section id, label
 * and keywords. Returns section entries in nav order.
 */
export function searchSettings(index: readonly SettingsSearchEntry[], query: string): SettingsSearchEntry[] {
  const q = normalize(query);
  if (!q) return [...index];
  const terms = q.split(/\s+/).filter(Boolean);
  return index.filter((entry) => {
    const haystack = normalize(`${entry.sectionId} ${entry.label} ${entry.keywords.join(" ")}`);
    return terms.every((term) => haystack.includes(term));
  });
}
