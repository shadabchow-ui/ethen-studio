/**
 * Single authoritative IPC contract for Local Models (LM-P0-01 / LM-P0-09).
 * Both preload.ts and apps/desktop/ipc/local-models.ts must import from here.
 * No parallel type definitions are allowed — this file is the source of truth.
 */

export const LOCAL_MODELS_CHANNELS = {
  STATUS: "local-models:status",
  LIST_INSTALLED: "local-models:list-installed",
  LIST_RUNNING: "local-models:list-running",
  LIST_CATALOG: "local-models:list-catalog",
  SHOW: "local-models:show",
  PULL: "local-models:pull",
  CANCEL: "local-models:cancel",
  DELETE: "local-models:delete",
  CHAT: "local-models:chat",
} as const;

export const LOCAL_MODELS_EVENT_CHANNEL = "local-models:event" as const;

export type LocalModelIpcEvent =
  | { type: "pull:progress"; requestId: string; event: Record<string, unknown> }
  | { type: "pull:complete"; requestId: string; model: string }
  | { type: "pull:cancelled"; requestId: string; model: string; error: string }
  | { type: "pull:error"; requestId: string; model: string; error: string }
  | { type: "chat:delta"; requestId: string; content: string }
  | { type: "chat:complete"; requestId: string }
  | { type: "chat:error"; requestId: string; error: string };

export interface LocalModelsIpcBridge {
  status(): Promise<{ ok: boolean; status?: unknown; error?: string }>;
  listInstalled(): Promise<{ ok: boolean; status?: unknown; models?: unknown[]; error?: string }>;
  listRunning(): Promise<{ ok: boolean; models?: unknown[]; error?: string }>;
  listCatalog(): Promise<{ ok: boolean; models?: unknown[]; limitation?: string }>;
  show(model: string): Promise<{ ok: boolean; status?: unknown; model?: unknown | null; error?: string }>;
  pull(input: { model: string; approval: { approved: true; acknowledgement: string } }): Promise<{ ok: boolean; requestId?: string; error?: string }>;
  cancel(requestId: string): Promise<{ ok: boolean; error?: string }>;
  delete(input: { model: string; approval: { approved: true; acknowledgement: string } }): Promise<{ ok: boolean; error?: string }>;
  chat(request: { model: string; messages: Array<{ role: string; content: string }>; options?: Record<string, unknown> }): Promise<{ ok: boolean; requestId?: string; error?: string }>;
  onEvent(callback: (event: LocalModelIpcEvent) => void): () => void;
}
