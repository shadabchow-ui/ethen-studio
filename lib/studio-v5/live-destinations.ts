import type { LabWorkflowId } from "./media-manifest";
import { STUDIO_CANONICAL_ROUTES } from "./route-map";

export type StudioAppPanelId =
  | "ai-influencer"
  | "marketing-studio"
  | "cinema"
  | "canvas"
  | "compare-models"
  | "image-editor"
  | "characters"
  | "products"
  | "brands";

/** Append `?projectId=` only when a project scopes the destination. */
function withProject(path: string, projectId: string | null): string {
  return projectId ? `${path}?projectId=${encodeURIComponent(projectId)}` : path;
}

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * RC5 — every destination built from the route map. Retired nested and
 * alias shapes link straight at their canonical runtime; project scope
 * rides the query string. Nothing returned here may be a legacy
 * redirect source (enforced by the route-authority suite).
 */
export function studioWorkflowHref(workflow: LabWorkflowId | null, projectId: string | null): string {
  switch (workflow) {
    case "text-to-image":
      return withProject(STUDIO_CANONICAL_ROUTES.createImage, projectId);
    case "text-to-video":
    case "reference-to-video":
      return withProject(STUDIO_CANONICAL_ROUTES.createVideo, projectId);
    case "image-to-video":
      return withQuery(STUDIO_CANONICAL_ROUTES.createVideo, { mode: "image-to-video", projectId });
    case "edit-image":
    case "background":
    case "restyle":
      return withProject(STUDIO_CANONICAL_ROUTES.createEdit, projectId);
    case "edit-video":
      return withProject("/studio/pro/video", projectId);
    case "text-to-audio":
      return withProject(STUDIO_CANONICAL_ROUTES.createVoice, projectId);
    case "image-to-3d":
      return withProject("/studio/create/3d", projectId);
    case "upscale":
      return withProject("/studio/pro/image", projectId);
    case "compare":
      return STUDIO_CANONICAL_ROUTES.models;
    default:
      return STUDIO_CANONICAL_ROUTES.models;
  }
}

export function studioAppHref(app: string, projectId: string | null): string {
  switch (app) {
    case "ai-influencer":
      return STUDIO_CANONICAL_ROUTES.influencer;
    case "marketing-studio":
      return STUDIO_CANONICAL_ROUTES.marketing;
    case "cinema":
      return STUDIO_CANONICAL_ROUTES.cinema;
    case "canvas":
      return STUDIO_CANONICAL_ROUTES.canvas;
    case "compare-models":
      return STUDIO_CANONICAL_ROUTES.models;
    case "image-editor":
      return "/studio/pro/image";
    case "characters":
    case "products":
    case "brands":
      return withProject(`/studio/identities/${app}`, projectId);
    default:
      return STUDIO_CANONICAL_ROUTES.models;
  }
}
