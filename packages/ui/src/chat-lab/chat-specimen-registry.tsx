/**
 * CHAT_A1 — the Chat Lab specimen registry.
 *
 * One registry, one implementation. The standalone specimen document and the
 * board's viewport frames render the SAME node, never a board-only copy of the
 * surface under review.
 */
import * as React from "react";
import { EthenChatShell } from "./ethen-chat-shell";
import {
  ArtifactErrorBoard,
  ComposerAttachmentsBoard,
  ComposerEmptyBoard,
  ComposerMultilineBoard,
  ComposerToolActiveBoard,
  ErrorsBoard,
  ModelSelectorBoard,
  SidebarDenseBoard,
  SidebarFullBoard,
  SourcesBoard,
  ToolActivityBoard,
  ToolsMenuBoard,
} from "./chat-specimen-boards";
import {
  CHAT_HISTORY_DENSE,
  THREAD_CODE,
  THREAD_RESEARCH,
  THREAD_SHORT,
  buildStressTranscript,
  type ChatTurn,
} from "./chat-fixtures";
import { StreamingDemo } from "./chat-streaming-demo";
import { CHAT_SPECIMEN_IDS } from "./chat-specimen-ids";

export type ChatSpecimenTheme = "system" | "light" | "dark";

export type ChatSpecimen = Readonly<{
  id: string;
  title: string;
  /** The CHAT-NN codes this specimen answers for. */
  codes: readonly string[];
  render: (theme: ChatSpecimenTheme) => React.ReactNode;
}>;

/** CHAT-22 — a turn arriving. Steps are live, prose is partial, actions wait. */
const STREAMING_THREAD: readonly ChatTurn[] = [
  THREAD_RESEARCH[0],
  {
    id: "stream",
    role: "ethen",
    streaming: true,
    steps: [
      { id: "s1", label: "Searched the web", detail: "12 results · 4 kept", state: "done" },
      { id: "s2", label: "Reading sources", detail: "3 of 4", state: "running" },
    ],
    blocks: [
      {
        kind: "p",
        text: "The pattern is consistent: the conversational surface is kept deliberately poor in navigation, and everything organisational is pushed to a second",
      },
    ],
  },
];

export const CHAT_SPECIMENS: readonly ChatSpecimen[] = [
  {
    id: "empty-dark",
    title: "Empty state — dark",
    codes: ["CHAT-01", "CHAT-18"],
    render: (theme) => <EthenChatShell theme={theme === "system" ? "dark" : theme} />,
  },
  {
    id: "empty-light",
    title: "Empty state — light",
    codes: ["CHAT-02"],
    render: () => <EthenChatShell theme="light" />,
  },
  { id: "sidebar-full", title: "Sidebar — full", codes: ["CHAT-03"], render: (theme) => <SidebarFullBoard theme={theme} /> },
  { id: "sidebar-dense", title: "Sidebar — dense history", codes: ["CHAT-04"], render: (theme) => <SidebarDenseBoard theme={theme} /> },
  { id: "composer-empty", title: "Composer — empty, ready, generating", codes: ["CHAT-05"], render: (theme) => <ComposerEmptyBoard theme={theme} /> },
  {
    id: "composer-multiline",
    title: "Composer — multiline",
    codes: ["CHAT-05"],
    render: (theme) => <ComposerMultilineBoard theme={theme} />,
  },
  {
    id: "composer-keyboard",
    title: "Composer — 390 keyboard-height simulation",
    codes: ["CHAT-19"],
    render: (theme) => (
      <EthenChatShell
        theme={theme}
        turns={THREAD_SHORT}
        title="D18A public foundation review"
        activeChatId="c2"
        composerValue="Review the D18A board.\n\nThree areas are drifting:\n1. The family vocabulary is not load-bearing.\n2. Section rhythm is uniform where it should be argued.\n3. The accent is doing decoration, not signalling."
        composerAttachments={[
          { id: "a4", name: "route-census.csv", kind: "document", meta: "CSV · 91 KB", state: "failed" },
        ]}
        composerTools={["web"]}
      />
    ),
  },
  { id: "composer-attachments", title: "Composer — attachments", codes: ["CHAT-06"], render: (theme) => <ComposerAttachmentsBoard theme={theme} /> },
  { id: "composer-tool-active", title: "Composer — tool active", codes: ["CHAT-07"], render: (theme) => <ComposerToolActiveBoard theme={theme} /> },
  { id: "model-selector", title: "Model selector", codes: ["CHAT-08"], render: (theme) => <ModelSelectorBoard theme={theme} /> },
  { id: "tools-menu", title: "Tools menu", codes: ["CHAT-09"], render: (theme) => <ToolsMenuBoard theme={theme} /> },
  {
    id: "conversation-short",
    title: "Conversation — short",
    codes: ["CHAT-10"],
    render: (theme) => (
      <EthenChatShell theme={theme} turns={THREAD_SHORT} title="D18A public foundation review" activeChatId="c2" />
    ),
  },
  {
    id: "conversation-research",
    title: "Conversation — long research",
    codes: ["CHAT-11", "CHAT-19"],
    render: (theme) => (
      <EthenChatShell theme={theme} turns={THREAD_RESEARCH} title="Chat and platform surface split" activeChatId="c3" />
    ),
  },
  {
    id: "conversation-code",
    title: "Conversation — code",
    codes: ["CHAT-12"],
    render: (theme) => (
      <EthenChatShell theme={theme} turns={THREAD_CODE} title="Chat rail token layer" activeChatId="c1" />
    ),
  },
  {
    id: "stress-100-turns",
    title: "Conversation — 100-turn stress",
    codes: ["CHAT-10", "CHAT-11"],
    render: (theme) => (
      <EthenChatShell theme={theme} turns={buildStressTranscript(100)} title="Stress transcript" activeChatId="c1" />
    ),
  },
  { id: "tool-activity", title: "Tool activity", codes: ["CHAT-13"], render: (theme) => <ToolActivityBoard theme={theme} /> },
  { id: "sources", title: "Sources", codes: ["CHAT-14"], render: (theme) => <SourcesBoard theme={theme} /> },
  {
    id: "artifact-panel",
    title: "Artifact panel",
    codes: ["CHAT-15", "CHAT-20"],
    render: (theme) => (
      <EthenChatShell theme={theme} turns={THREAD_CODE} title="Chat rail token layer" activeChatId="c1" artifactOpen />
    ),
  },
  {
    id: "artifact-error",
    title: "Artifact — loading and error",
    codes: ["CHAT-15"],
    render: (theme) => <ArtifactErrorBoard theme={theme} />,
  },
  {
    id: "project-context",
    title: "Project context",
    codes: ["CHAT-16"],
    render: (theme) => (
      <EthenChatShell
        theme={theme}
        turns={THREAD_SHORT}
        title="D18A public foundation review"
        activeChatId="c2"
        activeProjectId="ethen-v5"
        projectName="Ethen V5"
      />
    ),
  },
  {
    id: "search-palette",
    title: "Search palette",
    codes: ["CHAT-17"],
    render: (theme) => <EthenChatShell theme={theme} paletteOpen />,
  },
  {
    id: "mobile-drawer",
    title: "Mobile navigation drawer",
    codes: ["CHAT-18"],
    render: (theme) => <EthenChatShell theme={theme} history={CHAT_HISTORY_DENSE} drawerOpen />,
  },
  { id: "errors", title: "Errors and offline", codes: ["CHAT-21"], render: (theme) => <ErrorsBoard theme={theme} /> },
  {
    id: "loading",
    title: "Loading — perceived-fast startup",
    codes: ["CHAT-22"],
    render: (theme) => <EthenChatShell theme={theme} loading turns={THREAD_SHORT} title="D18A public foundation review" />,
  },
  {
    id: "streaming",
    title: "Streaming response",
    codes: ["CHAT-22"],
    render: (theme) => (
      <EthenChatShell theme={theme} turns={STREAMING_THREAD} title="Chat and platform surface split" generating />
    ),
  },
  {
    id: "streaming-live",
    title: "Streaming — live follow demo",
    codes: ["CHAT-22"],
    render: (theme) => <StreamingDemo theme={theme} />,
  },
];

/*
 * The registry and the id list cannot drift — see chat-specimen-ids.ts.
 */
const registered = CHAT_SPECIMENS.map((specimen) => specimen.id).sort();
const declared = [...CHAT_SPECIMEN_IDS].sort();
if (registered.join("|") !== declared.join("|")) {
  const missing = declared.filter((id) => !registered.includes(id));
  const extra = registered.filter((id) => !declared.includes(id));
  throw new Error(
    "[chat specimen registry] chat-specimen-ids.ts and CHAT_SPECIMENS disagree. " +
      `Registered but not declared: [${extra.join(", ")}]. ` +
      `Declared but not registered: [${missing.join(", ")}].`,
  );
}

export function chatSpecimenById(id: string): ChatSpecimen | undefined {
  return CHAT_SPECIMENS.find((specimen) => specimen.id === id);
}
