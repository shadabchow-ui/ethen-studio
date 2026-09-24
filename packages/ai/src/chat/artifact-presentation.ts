/**
 * Client-safe artifact presentation contract.
 *
 * `lib/chat/artifacts.ts` owns artifact persistence and therefore reaches
 * `lib/supabase/service.ts`, which is marked `server-only`. The chat artifact
 * panel is a Client Component and only needs the artifact *kind* union and the
 * default presentation seed, so those live here where no server module is in
 * the import graph. Server persistence re-exports both from this module, so
 * `@ethen/ai/chat/artifacts` remains the single import site for server callers.
 */

export type ChatArtifactKind =
  | "text"
  | "code"
  | "image"
  | "sheet"
  | "table"
  | "markdown"
  | "plan";

export const DEFAULT_CHAT_ARTIFACT: Readonly<{ title: string; body: string; kind: ChatArtifactKind }> = {
  title: "D18A_PUBLIC_FOUNDATION_BOARD.md",
  body: "# Ethen V5 · Public Foundation\n\n| Surface | Token | Value |\n|---|---|---|\n| Canvas | --bg | #050608 |\n| Rail | --chat-sidebar | #090B10 |\n| Text | --fg | #EDEDED |\n\n1. Minimalist chat workspace\n2. Contextual dismissible side panel\n3. Single source of run truth",
  kind: "markdown",
};
