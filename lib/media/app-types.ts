export type MediaStudioChatActionId =
  | "refine-prompt"
  | "use-in-prompt"
  | "run-app"
  | "create-variation"
  | "save-asset"
  | "add-to-project"
  | "send-to-canvas"
  | "explain-failure"
  | "suggest-model"
  | "estimate-credits";

export interface MediaStudioChatContext {
  workspace: "media-studio";
  appId: string;
  appTitle: string;
  toolId: string | null;
  projectId: string | null;
  selectedAssetId: string | null;
  currentJobId: string | null;
  providerStatus: string;
  availableActions: string[];
}

export const MEDIA_STUDIO_CHAT_ACTION_LABELS: Record<MediaStudioChatActionId, string> = {
  "refine-prompt": "Refine prompt",
  "use-in-prompt": "Use in prompt",
  "run-app": "Run app",
  "create-variation": "Create variation",
  "save-asset": "Save asset",
  "add-to-project": "Add to project",
  "send-to-canvas": "Send to Canvas",
  "explain-failure": "Explain failure",
  "suggest-model": "Suggest model",
  "estimate-credits": "Estimate credits",
};

export const MEDIA_STUDIO_CHAT_ACTION_PREFILLS: Record<MediaStudioChatActionId, string> = {
  "refine-prompt": "Refine my current prompt to be more specific",
  "use-in-prompt": "Use this suggestion in the app prompt",
  "run-app": "Run the current app with my inputs",
  "create-variation": "Create a variation of the current result",
  "save-asset": "Save the current asset to my library",
  "add-to-project": "Add this asset to the current project",
  "send-to-canvas": "Send the current result to the Canvas workspace",
  "explain-failure": "Explain what went wrong with the last attempt",
  "suggest-model": "Suggest the best model for this task",
  "estimate-credits": "Estimate credits needed for this workflow",
};
