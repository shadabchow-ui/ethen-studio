import { EthenChatShell } from "./ethen-chat-shell";

/**
 * Canonical Ethen Chat surface.
 *
 * B2: `/chat` (apps/chat-core) and the monolith's deployment-target dispatch
 * both render this, so there is exactly one chat surface implementation. The
 * In production, `useChatConversation` selects
 * `createEthenProductionRuntime()`; deterministic runtimes retain their own
 * hard production guard. The surface itself therefore remains renderable in
 * a production target build.
 */
export function EthenChatSurface() {
  return <EthenChatShell />;
}
