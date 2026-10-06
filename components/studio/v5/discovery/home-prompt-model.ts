/**
 * RC9 — home prompt routing model (pure, node-testable).
 *
 * The home composer navigates with `?prompt=` while the prompt fits the
 * URL-safe threshold; longer prompts travel via the sessionStorage
 * handoff (`?promptRef=`). Kept free of React/Next imports so tests and
 * the create route can share the contract.
 */
import { getCreateTool } from "../create/tool-definitions";

const PROMPT_TOOL_IDS = ["image", "edit", "video", "voice", "music", "sfx", "3d"] as const;

export type HomePromptToolId = (typeof PROMPT_TOOL_IDS)[number];

export function isHomePromptToolId(value: string): value is HomePromptToolId {
  return (PROMPT_TOOL_IDS as readonly string[]).includes(value);
}

export function homePromptToolRoute(id: HomePromptToolId): string {
  return getCreateTool(id)?.route ?? `/studio/create/${id}`;
}

export function homePromptHref(toolId: HomePromptToolId, projectId: string | null, prompt: string): string {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  const trimmed = prompt.trim();
  if (trimmed) params.set("prompt", trimmed);
  const query = params.toString();
  return query ? `${homePromptToolRoute(toolId)}?${query}` : homePromptToolRoute(toolId);
}
