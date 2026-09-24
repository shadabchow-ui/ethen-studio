/**
 * Canonical domain types for Ethen Chat.
 *
 * Owned by Ethen Chat product target. Production runtime and API handlers
 * consume these types directly without importing from development labs.
 */

export type ChatProject = Readonly<{
  id: string;
  name: string;
  chats: number;
}>;

export type ChatHistoryItem = Readonly<{
  id: string;
  title: string;
  project?: string;
}>;

export type ChatHistoryGroup = Readonly<{
  label: string;
  items: readonly ChatHistoryItem[];
}>;

export type ChatTool = Readonly<{
  id: string;
  name: string;
  detail: string;
  surface: string;
}>;

export type ChatAttachment = Readonly<{
  id: string;
  name: string;
  kind: "image" | "document" | "code";
  meta: string;
  state?: "ready" | "uploading" | "failed";
}>;

export type ProseBlock =
  | Readonly<{ kind: "p"; text: string }>
  | Readonly<{ kind: "h"; text: string }>
  | Readonly<{ kind: "ul"; items: readonly string[] }>
  | Readonly<{ kind: "ol"; items: readonly string[] }>
  | Readonly<{ kind: "quote"; text: string }>
  | Readonly<{ kind: "code"; language: string; code: string }>
  | Readonly<{ kind: "table"; head: readonly string[]; rows: readonly (readonly string[])[] }>;

export type ChatSource = Readonly<{
  id: string;
  title: string;
  origin: string;
  detail: string;
}>;

export type ToolStep = Readonly<{
  id: string;
  label: string;
  detail: string;
  state: "running" | "done" | "failed";
}>;

export type ChatTurn = Readonly<{
  id: string;
  role: "user" | "ethen";
  text?: string;
  blocks?: readonly ProseBlock[];
  attachments?: readonly ChatAttachment[];
  steps?: readonly ToolStep[];
  sources?: readonly ChatSource[];
  artifact?: string;
  streaming?: boolean;
  streamText?: string;
  stopped?: boolean;
  attempt?: number;
  runId?: string;
  error?: Readonly<{ title: string; detail: string; action: string }>;
  meta?: Readonly<{
    model?: string;
    durationMs?: number;
    tokens?: number;
    routingReason?: string;
  }>;
}>;

export type StreamBlock = ProseBlock & Readonly<{ key: string }>;

export type ChatRuntimeHooks = Readonly<{
  onWorking: (runId: string) => void;
  onToolActivity: (runId: string, steps: readonly ToolStep[]) => void;
  onSources: (runId: string, sources: readonly ChatSource[]) => void;
  onChunk: (runId: string, text: string) => void;
  onCompleted: (runId: string, text: string) => void;
  onFailed: (runId: string) => void;
}>;

export type ChatRuntimeHandle = Readonly<{ cancel: () => void }>;

export type ChatRuntimeOutcome = "success" | "failure";

export type ChatSubmission = Readonly<{
  runId: string;
  text: string;
  model: string;
  thinking?: string;
  tools?: readonly string[];
  attachments?: readonly ChatAttachment[];
  projectId?: string | null;
}>;

export type ChatRuntime = Readonly<{
  start: (submission: ChatSubmission, hooks: ChatRuntimeHooks) => ChatRuntimeHandle;
}>;
