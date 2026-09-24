export type ArtifactType =
  | "markdown"
  | "code"
  | "table"
  | "image_ref"
  | "json"
  | "plan";

export interface Artifact {
  id: string;
  session_id: string;
  message_id: string | null;
  title: string | null;
  artifact_type: ArtifactType;
  content: string | null;
  metadata: Record<string, unknown> | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type ToolActivityStatus = "pending" | "running" | "success" | "error";

export interface ToolActivityItem {
  id: string;
  label: string;
  tool: string;
  status: ToolActivityStatus;
  inputSummary?: string;
  outputSummary?: string;
  details?: Record<string, unknown> | null;
}

export type CreateArtifactInput = {
  session_id: string;
  message_id?: string;
  title?: string;
  artifact_type: ArtifactType;
  content?: string;
  metadata?: Record<string, unknown>;
};

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  markdown: "Document",
  code: "Code",
  table: "Table",
  image_ref: "Image",
  json: "JSON",
  plan: "Plan",
};
