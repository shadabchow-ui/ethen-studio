/**
 * Studio V5 RC7 — the Studio search index (pure, client-safe, node-testable).
 *
 * Static entries (create tools, pro tools, apps, templates, Studio pages,
 * settings sections) plus generated entries (model families) become palette
 * results with Studio groups. Every href comes from the canonical route
 * helpers — the index never invents destinations. Entries that cannot
 * resolve a public href (project-gated with no fallback) are omitted, never
 * linked to a guess.
 */
import type { SearchResult, StudioSearchGroup } from "@ethen/ui/chat-lab/chat-fixtures";
import { taskLabel } from "@ethen/studio-core/catalog/task-labels";
import { STUDIO_CANONICAL_ROUTES, studioSettingsHref } from "@/lib/studio-v5/route-map";
import {
  getStudioV5NavSections,
  resolveStudioV5Entry,
} from "../shell/navigation-model";
import { AUDIO_TOOL_DEFINITIONS } from "../create/audio/audio-tool-bindings";
import { LAB_APPS } from "@/lib/studio-v5/workflows";
import { studioShowcaseAppHref } from "@/lib/studio-v5/showcase";
import { sectionsForProduct } from "@ethen/ui/settings/settings-sections";
import { CURATED_TEMPLATES } from "../discovery/templates-data";

/** Model-family view the index needs (familyId/label/tasks). */
export interface StudioSearchFamily {
  familyId: string;
  label: string;
  tasks: readonly string[];
}

export interface StudioSearchIndex {
  results: SearchResult[];
  hrefs: Map<string, string>;
}

function push(
  index: StudioSearchIndex,
  group: StudioSearchGroup,
  id: string,
  title: string,
  detail: string,
  href: string,
): void {
  if (index.hrefs.has(id)) return;
  index.hrefs.set(id, href);
  index.results.push({ id, title, group, detail });
}

function createToolTitle(entryId: string, label: string): string {
  const toolId = entryId.startsWith("create-") ? entryId.slice("create-".length) : entryId;
  const audio = (AUDIO_TOOL_DEFINITIONS as Readonly<Record<string, { title: string }>>)[toolId];
  if (audio) return audio.title;
  if (toolId === "edit") return label;
  return `Create ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/**
 * Build the Studio palette index. Families come from the live catalog
 * projection (same familyId/label/tasks shape as fal-catalog-search.json);
 * pass an empty array before the catalog loads — static entries always
 * resolve and families merge in when available.
 */
export function buildStudioSearchIndex(families: readonly StudioSearchFamily[]): StudioSearchIndex {
  const index: StudioSearchIndex = { results: [], hrefs: new Map() };
  const sections = getStudioV5NavSections();

  for (const section of sections) {
    if (section.id === "create") {
      for (const entry of section.entries) {
        const resolved = resolveStudioV5Entry(entry, { projectId: null });
        if (!resolved.resolvedHref) continue;
        push(
          index,
          "Create",
          `create:${entry.id}`,
          createToolTitle(entry.id, entry.label),
          `Create tool · ${entry.label}`,
          resolved.resolvedHref,
        );
      }
    } else if (section.id === "pro") {
      for (const entry of section.entries) {
        const resolved = resolveStudioV5Entry(entry, { projectId: null });
        if (!resolved.resolvedHref) continue;
        push(index, "Pro", `pro:${entry.id}`, entry.title ?? entry.label, "Pro workbench", resolved.resolvedHref);
      }
    }
  }

  for (const sectionId of ["build", "discover", "work", "products"] as const) {
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section) continue;
    for (const entry of section.entries) {
      const resolved = resolveStudioV5Entry(entry, { projectId: null });
      if (!resolved.resolvedHref) continue;
      push(index, "Pages", `page:${entry.id}`, entry.label, `${section.label} · Studio page`, resolved.resolvedHref);
    }
  }
  push(index, "Pages", "page:settings", "Settings", "Studio page", STUDIO_CANONICAL_ROUTES.settings);

  for (const app of LAB_APPS) {
    push(index, "Apps", `app:${app.id}`, app.name, app.detail, studioShowcaseAppHref(app.id, null));
  }

  for (const template of CURATED_TEMPLATES) {
    push(index, "Templates", `template:${template.id}`, template.title, template.description, template.href);
  }

  for (const section of sectionsForProduct("studio")) {
    const keywords = section.keywords.slice(0, 4).join(", ");
    push(
      index,
      "Settings",
      `settings:${section.id}`,
      section.label,
      keywords ? `Settings · ${keywords}` : "Settings",
      studioSettingsHref(section.id),
    );
  }

  for (const family of families) {
    const labels = family.tasks.map((task) => taskLabel(task));
    const unique = [...new Set(labels)].filter((label) => label !== "Other / unclassified");
    push(
      index,
      "Models",
      `model-family:${family.familyId}`,
      family.label,
      unique.length > 0 ? `Model family · ${unique.join(", ")}` : "Model family",
      `${STUDIO_CANONICAL_ROUTES.models}?q=${encodeURIComponent(family.label)}`,
    );
  }

  return index;
}

/** Palette-equivalent matcher (title + detail substring) for tests. */
export function matchStudioSearchIndex(index: StudioSearchIndex, query: string): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...index.results];
  return index.results.filter(
    (result) =>
      result.title.toLowerCase().includes(needle) || result.detail.toLowerCase().includes(needle),
  );
}
