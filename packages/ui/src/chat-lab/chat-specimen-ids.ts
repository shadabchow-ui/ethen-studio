/**
 * CHAT_A1 — the Chat Lab specimen ids, as data.
 *
 * Same split, and same reason, as `components/dev/ethen-lab/specimen-ids.ts`:
 * the registry that pairs an id with its renderer is a client module reaching
 * CSS and `next/link`, so a plain Node validator cannot import it. The ids
 * therefore live in a module with no imports and no directive, and the
 * registry reconciles itself against this list at load time — a specimen added
 * to one and not the other throws on import instead of drifting.
 */
export const CHAT_SPECIMEN_IDS: readonly string[] = [
  "empty-dark",
  "empty-light",
  "sidebar-full",
  "sidebar-dense",
  "composer-empty",
  "composer-multiline",
  "composer-keyboard",
  "composer-attachments",
  "composer-tool-active",
  "model-selector",
  "tools-menu",
  "conversation-short",
  "conversation-research",
  "conversation-code",
  "stress-100-turns",
  "tool-activity",
  "sources",
  "artifact-panel",
  "artifact-error",
  "project-context",
  "search-palette",
  "mobile-drawer",
  "errors",
  "loading",
  "streaming",
  "streaming-live",
];
