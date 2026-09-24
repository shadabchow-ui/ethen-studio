import type { LabWorkflowId } from "./media-manifest";

/** Map editorial fixtures to existing, authorized V5 destinations. */
export function studioWorkflowHref(workflow: LabWorkflowId | null, projectId: string | null): string {
  const project = projectId ? `/studio/projects/${encodeURIComponent(projectId)}` : null;
  switch (workflow) {
    case "text-to-image": return project ? `${project}/create/image` : "/studio/projects";
    case "text-to-video":
    case "image-to-video":
    case "reference-to-video": return project ? `${project}/create/video` : "/studio/projects";
    case "edit-image":
    case "background":
    case "restyle": return project ? `${project}/edit/image` : "/studio/projects";
    case "edit-video": return "/studio/pro/video";
    case "text-to-audio": return projectId ? `/studio/create/voice?projectId=${encodeURIComponent(projectId)}` : "/studio/create/voice";
    case "image-to-3d": return projectId ? `/studio/create/3d?projectId=${encodeURIComponent(projectId)}` : "/studio/create/3d";
    case "upscale": return "/studio/pro/image";
    case "compare": return "/studio/models";
    default: return "/studio/models";
  }
}

export function studioAppHref(id: string, projectId: string | null): string {
  const fixed: Record<string, string> = {
    "ai-influencer": "/studio/apps/ai-influencer",
    "marketing-studio": "/studio/apps/marketing",
    cinema: "/studio/cinema",
    canvas: "/studio/canvas",
    "compare-models": "/studio/models",
    "image-editor": "/studio/pro/image",
    characters: projectId ? `/studio/projects/${encodeURIComponent(projectId)}/characters` : "/studio/projects",
    products: projectId ? `/studio/projects/${encodeURIComponent(projectId)}/products` : "/studio/projects",
    brands: projectId ? `/studio/projects/${encodeURIComponent(projectId)}/brands` : "/studio/projects",
  };
  return fixed[id] ?? "/studio/apps";
}
