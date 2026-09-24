"use client";

/**
 * CHAT_A1 shell + CHAT_A2_1 local conversation lifecycle.
 *
 * Every CHAT-01…CHAT-22 specimen is THIS component in a different state. The
 * alternative — twenty-two independent trees — is how a design lab starts
 * reviewing drawings of a product instead of the product.
 *
 * Structure: rail · canvas · (optional) artifact. There is no marketing
 * header, no toolbar row, and no permanent third column. The top chrome is a
 * 48px strip that is empty until a conversation exists.
 *
 * CHAT_A2_1: run state has ONE owner — `useChatConversation`. The composer is
 * a controlled input surface (draft, attachments, tools, model, thinking) and
 * never keeps conflicting generation state. The runtime is selected by
 * `useChatConversation`: the API-backed production runtime in production
 * builds, a deterministic local runtime otherwise.
 *
 * Local keyboard behaviour only, and only the shortcuts the spec names:
 * ⌘/Ctrl+K search, ⌘/Ctrl+N new chat, Escape closes the top overlay. Nothing
 * else is intercepted.
 */
import * as React from "react";
import { ArtifactPanel } from "./artifact-panel";
import { ChatComposer, type ComposerMenu } from "./chat-composer";
import { ChatIcon } from "./chat-icons";
import { ChatMenu } from "./chat-menu";
import { ChatSidebar } from "./chat-sidebar";
import { ConversationThread } from "./conversation-thread";
import { SearchPalette } from "./search-palette";
import { followOnScroll, resumeOnJump, suspendOnSelect, suspendsOnKey } from "./chat-scroll-follow";
import type { ChatRuntime } from "./chat-mock-runtime";
import { useChatConversation } from "./use-chat-conversation";
import {
  CHAT_HISTORY,
  GREETING,
  type ChatAttachment,
  type ChatHistoryGroup,
  type ChatTurn,
} from "./chat-fixtures";
import styles from "./ethen-chat-shell.module.css";

export type EthenChatShellProps = Readonly<{
  theme?: "system" | "light" | "dark";
  /** An empty thread renders the greeting + centered composer. */
  turns?: readonly ChatTurn[];
  title?: string;
  history?: readonly ChatHistoryGroup[];
  activeChatId?: string | null;
  activeProjectId?: string | null;
  projectName?: string | null;
  projectsEmpty?: boolean;
  greeting?: string;
  artifactOpen?: boolean;
  paletteOpen?: boolean;
  drawerOpen?: boolean;
  loading?: boolean;
  composerValue?: string;
  composerAttachments?: readonly ChatAttachment[];
  composerTools?: readonly string[];
  composerMenu?: ComposerMenu;
  generating?: boolean;
  activeArtifact?: Readonly<{ title: string; body: string; kind?: string }>;
  notice?: React.ComponentProps<typeof ChatComposer>["notice"];
  /** CHAT_A2_2 — deterministic local runtime override (streaming story specimen). */
  runtime?: ChatRuntime | null;
}>;

function RailSkeleton() {
  return (
    <div className={styles.railSkeleton} aria-hidden="true">
      <span className={styles.skelWordmark} />
      <span className={styles.skelButton} />
      {[0, 1, 2].map((row) => (
        <span className={styles.skelRow} key={`nav-${row}`} />
      ))}
      <span className={styles.skelLabel} />
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <span className={styles.skelRow} key={`chat-${row}`} style={{ width: `${86 - row * 7}%` }} />
      ))}
    </div>
  );
}

export function EthenChatShell({
  theme = "system",
  turns = [],
  title,
  history = CHAT_HISTORY,
  activeChatId = null,
  activeProjectId = null,
  projectName = null,
  projectsEmpty = false,
  greeting = GREETING,
  artifactOpen = false,
  paletteOpen = false,
  drawerOpen = false,
  loading = false,
  composerValue = "",
  composerAttachments = [],
  composerTools = [],
  composerMenu = null,
  generating = false,
  activeArtifact,
  notice,
  runtime = null,
}: EthenChatShellProps) {
  const [artifact, setArtifact] = React.useState(artifactOpen);
  const [palette, setPalette] = React.useState(paletteOpen);
  const [drawer, setDrawer] = React.useState(drawerOpen);
  // One owner for the conversation lifecycle. Specimen props seed the initial
  // state; every later transition goes through the controller.
  const chat = useChatConversation(
    {
      turns,
      draft: composerValue,
      attachments: composerAttachments,
      tools: composerTools,
      activeChatId,
    },
    runtime ?? undefined,
  );
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const paletteReturnRef = React.useRef<HTMLElement | null>(null);
  // CHAT_A3 — focus return targets: the opener that yields to a modal surface.
  const drawerReturnRef = React.useRef<HTMLElement | null>(null);
  const artifactReturnRef = React.useRef<HTMLElement | null>(null);
  const drawerPanelRef = React.useRef<HTMLDivElement | null>(null);

  const thread = chat.state.turns;
  const empty = thread.length === 0;
  // Stable run-owner callbacks (declared before effects that use them).
  const { newChat, selectChat } = chat;
  // Specimen boards pass `generating` as static presentation state; live runs
  // report through the controller. The composer still sees one boolean.
  const generatingNow = chat.generating || generating;
  const activeNotice =
    chat.state.failure != null
      ? { title: chat.state.failure.title, detail: chat.state.failure.detail, action: chat.state.failure.action, tone: "danger" as const }
      : notice;

  // CHAT_A2_2 reader-respecting follow: stream updates pin the bottom only
  // while the reader is already there — never yanked while reading back.
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [follow, setFollow] = React.useState(true);
  const followRef = React.useRef(true);
  const setFollowBoth = React.useCallback((next: boolean) => {
    followRef.current = next;
    setFollow(next);
  }, []);

  const scrollToBottom = React.useCallback(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  // Pin while following; a suspended reader stays exactly where they are.
  React.useEffect(() => {
    if (followRef.current) scrollToBottom();
  }, [thread, scrollToBottom]);

  const onThreadScroll = React.useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    setFollowBoth(
      followOnScroll({ scrollHeight: node.scrollHeight, scrollTop: node.scrollTop, clientHeight: node.clientHeight }),
    );
  }, [setFollowBoth]);

  const onThreadKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (suspendsOnKey(event.key)) setFollowBoth(false);
    },
    [setFollowBoth],
  );

  // Text selection suspends follow so selection and find are never disturbed.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const onSelectStart = () => setFollowBoth(suspendOnSelect());
    node.addEventListener("selectstart", onSelectStart);
    return () => node.removeEventListener("selectstart", onSelectStart);
  }, [setFollowBoth]);

  const jumpToLatest = React.useCallback(() => {
    setFollowBoth(resumeOnJump());
    // Layout first, then pin — one frame is enough for the new tail to measure.
    requestAnimationFrame(() => scrollToBottom());
  }, [scrollToBottom, setFollowBoth]);

  // On send the submitted user turn scrolls into a comfortable view with
  // room left for the incoming response; follow resumes for the exchange.
  // Follow resumes in the send event itself (not an effect); the effect below
  // only positions existing DOM after layout.
  const lastSubmission = chat.submissionPreview;
  const handleSend = React.useCallback(() => {
    if (chat.send()) setFollowBoth(true);
  }, [chat, setFollowBoth]);
  React.useEffect(() => {
    if (!lastSubmission) return;
    const userTurnId = lastSubmission.userTurnId;
    requestAnimationFrame(() => {
      const root = scrollRef.current;
      const target = root?.querySelector(`[data-turn-id="${userTurnId}"]`);
      if (root && target instanceof HTMLElement) {
        root.scrollTop = Math.max(0, target.offsetTop - 96);
      }
    });
  }, [lastSubmission]);

  // CHAT_A3 — overlay open/close with focus return. Declared before the
  // keydown effect that invokes them.
  const closePalette = React.useCallback(() => {
    setPalette(false);
    paletteReturnRef.current?.focus?.();
  }, []);
  const openDrawer = React.useCallback(() => {
    drawerReturnRef.current = document.activeElement as HTMLElement;
    setDrawer(true);
  }, []);
  const closeDrawer = React.useCallback(() => {
    setDrawer(false);
    drawerReturnRef.current?.focus?.();
  }, []);
  const openArtifact = React.useCallback(() => {
    artifactReturnRef.current = document.activeElement as HTMLElement;
    setArtifact(true);
  }, []);
  const closeArtifact = React.useCallback(() => {
    setArtifact(false);
    artifactReturnRef.current?.focus?.();
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        paletteReturnRef.current = document.activeElement as HTMLElement;
        setPalette(true);
      } else if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        newChat();
        setArtifact(false);
      } else if (event.key === "Escape") {
        // One overlay at a time, closed in the order they stack.
        if (palette) return; // the palette closes itself and restores focus
        if (drawer) return; // the drawer trap above closes and restores focus
        else if (artifact) closeArtifact();
      }
    };
    const node = rootRef.current;
    node?.addEventListener("keydown", onKeyDown);
    return () => node?.removeEventListener("keydown", onKeyDown);
  }, [palette, drawer, artifact, newChat, closeArtifact]);

  // CHAT_A3 — the drawer is a modal navigation surface: initial focus on
  // open, containment while open (including portal menus it spawned), Escape
  // closes with focus restored. The conversation behind it goes inert.
  React.useEffect(() => {
    if (!drawer) return;
    const panel = drawerPanelRef.current;
    const first = panel?.querySelector<HTMLElement>(
      'button:not(:disabled), [href], input, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // A portal menu owns its own Escape; the drawer yields to it.
      const inMenu = (event.target as HTMLElement | null)?.closest?.("[data-chat-menu-portal]");
      if (event.key === "Escape" && !inMenu) {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      // Contain Tab inside the drawer plus any open chat menu portal.
      const scope = [
        ...(drawerPanelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input, [tabindex]:not([tabindex="-1"])',
        ) ?? []),
        ...(document.querySelectorAll<HTMLElement>(
          '[data-chat-menu-portal] button:not(:disabled)',
        ) ?? []),
      ].filter((node) => node.offsetParent !== null || node === document.activeElement);
      if (scope.length === 0) return;
      const firstNode = scope[0];
      const lastNode = scope[scope.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [drawer, closeDrawer]);

  // Stable callbacks into the single run owner: memoized rows and the
  // memoized sidebar below keep their references across streamed chunks.
  const activeChatIdNow = chat.state.activeChatId;
  const handleSelectChat = React.useCallback(
    (chatId: string) => {
      // Minimal local activation with no persistence/backend: selecting a
      // different conversation activates it as an empty local thread rather
      // than inventing history that was never loaded.
      if (chatId === activeChatIdNow) return;
      selectChat(chatId, []);
      setArtifact(false);
    },
    [selectChat, activeChatIdNow],
  );
  const handleNewChat = React.useCallback(() => {
    newChat();
    setArtifact(false);
    closeDrawer();
  }, [newChat, closeDrawer]);
  const handleSearch = React.useCallback(() => {
    // Drawer yields to the palette; the palette restores to the drawer opener.
    if (drawer) paletteReturnRef.current = drawerReturnRef.current;
    setDrawer(false);
    setPalette(true);
  }, [drawer]);
  const handleCloseDrawer = React.useCallback(() => closeDrawer(), [closeDrawer]);
  const handleOpenArtifact = React.useCallback(() => openArtifact(), [openArtifact]);

  const sidebar = React.useMemo(
    () => (
      <ChatSidebar
        history={history}
        activeChatId={activeChatIdNow}
        activeProjectId={activeProjectId}
        projectsEmpty={projectsEmpty}
        variant={drawer ? "drawer" : "rail"}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onSearch={handleSearch}
        onClose={handleCloseDrawer}
      />
    ),
    [
      history,
      activeChatIdNow,
      activeProjectId,
      projectsEmpty,
      drawer,
      handleNewChat,
      handleSelectChat,
      handleSearch,
      handleCloseDrawer,
    ],
  );

  // ONE composer instance for empty and docked states — the same element is
  // mounted in exactly one of the two positions below, so the input (and its
  // focus) survives every state transition.
  const composer = (
    <ChatComposer
      placement={empty ? "centered" : "docked"}
      initialMenu={composerMenu}
      value={chat.state.draft}
      attachments={chat.state.attachments}
      tools={chat.state.tools}
      modelId={chat.state.modelId}
      thinking={chat.state.thinking}
      canSend={chat.canSendNow}
      generating={generatingNow}
      notice={activeNotice}
      projectName={projectName}
      ariaLabel={empty ? "Message Ethen" : "Reply to Ethen"}
      onValueChange={chat.setDraft}
      onAttachmentsChange={chat.setAttachments}
      onToolsChange={chat.setTools}
      onModelChange={chat.setModel}
      onThinkingChange={chat.setThinking}
      onSend={handleSend}
      onStop={chat.stop}
      onNoticeAction={chat.retry}
    />
  );

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-ethen-chat
      data-eds
      data-eds-theme={theme}
      data-eds-density="work"
    >
      <a className={styles.skipLink} href="#chat-main">
        Skip to conversation
      </a>

      <div className={styles.shell} inert={drawer ? true : undefined}>
        <div className={styles.rail}>{loading ? <RailSkeleton /> : sidebar}</div>

        <div className={styles.main} data-artifact={artifact ? "true" : undefined}>
          <header className={styles.topbar}>
            {/* The label is deliberately NOT "Open navigation":
              * app/foundation-shell-compat.css targets that exact string with a
              * light-theme background override written for the console shell,
              * and it repaints this button white inside a dark Chat scope. */}
            <button
              type="button"
              className={styles.menuButton}
              aria-label="Open Ethen Chat navigation"
              aria-expanded={drawer}
              aria-controls="chat-drawer"
              onClick={openDrawer}
            >
              <ChatIcon name="menu" size={18} />
            </button>

            {!empty ? (
              <>
                <div className={styles.topbarTitle}>
                  <h1>{title ?? "Conversation"}</h1>
                  {projectName ? <span className={styles.projectChip}>{projectName}</span> : null}
                </div>
                <div className={styles.topbarActions}>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    disabled
                    title="Sharing is not wired in this lab preview"
                  >
                    Share
                  </button>
                  <ChatMenu
                    label="Conversation actions"
                    placement="bottom"
                    align="end"
                    trigger={<ChatIcon name="more" size={16} />}
                    footer="Lab preview — conversation actions are not wired."
                    groups={[
                      {
                        items: [
                          { id: "rename", label: "Rename", disabled: true },
                          { id: "project", label: "Move to project", disabled: true },
                          { id: "export", label: "Export", disabled: true },
                        ],
                      },
                      { items: [{ id: "delete", label: "Delete", tone: "danger", disabled: true }] },
                    ]}
                  />
                </div>
              </>
            ) : (
              <div className={styles.topbarTitle}>
                {projectName ? <span className={styles.projectChip}>{projectName}</span> : null}
              </div>
            )}
          </header>

          <div className={styles.workspace} data-artifact={artifact ? "true" : undefined}>
            <main
              id="chat-main"
              className={styles.canvas}
              data-empty={empty ? "true" : undefined}
              aria-label="Conversation"
            >
              {loading ? (
                <div className={styles.canvasSkeleton} aria-hidden="true">
                  <span style={{ width: "62%" }} />
                  <span style={{ width: "88%" }} />
                  <span style={{ width: "74%" }} />
                </div>
              ) : empty ? (
                /* The empty cluster sits slightly ABOVE mathematical centre —
                 * dead centre reads as a landing page, not a workspace. */
                <div className={styles.emptyCluster}>
                  <h2 className={styles.greeting}>{greeting}</h2>
                  {composer}
                </div>
              ) : (
                <div
                  ref={scrollRef}
                  className={styles.threadScroll}
                  onScroll={onThreadScroll}
                  onKeyDown={onThreadKeyDown}
                >
                  <div className={styles.threadInner}>
                    <ConversationThread
                      turns={thread}
                      artifactOpen={artifact}
                      onOpenArtifact={handleOpenArtifact}
                      onRetry={chat.retry}
                    />
                  </div>
                </div>
              )}

              {/* The composer is present the moment the shell is, including
                * while the conversation is still loading (spec §39). */}
              {!empty || loading ? (
                <div className={styles.dock}>
                  {!follow && !empty ? (
                    <div className={styles.jumpWrap}>
                      <button type="button" className={styles.jumpLatest} onClick={jumpToLatest}>
                        Jump to latest
                      </button>
                    </div>
                  ) : null}
                  {composer}
                </div>
              ) : null}
            </main>

            {artifact ? (
              <div className={styles.artifact}>
                <ArtifactPanel
                  title={activeArtifact?.title}
                  body={activeArtifact?.body}
                  onClose={closeArtifact}
                  autoFocus
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {drawer ? (
        <div id="chat-drawer" className={styles.drawer} role="dialog" aria-modal="true" aria-label="Ethen Chat navigation">
          <button
            type="button"
            className={styles.drawerScrim}
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={closeDrawer}
          />
          <div className={styles.drawerPanel} ref={drawerPanelRef}>{sidebar}</div>
        </div>
      ) : null}

      <SearchPalette
        open={palette}
        onClose={closePalette}
        onActivate={(result) => {
          // CHAT_A5.1 — only chat results map to a supported local action
          // (minimal local activation); anything else arrives disabled and
          // can never reach here.
          if (result.group !== "Chats") return;
          handleSelectChat(result.chatId ?? result.id);
        }}
      />
      {/* CHAT_A5 — one concise live region for run status only (Working /
        Thinking / Stopped / Failed). Streamed tokens and blocks never
        announce; the label changes on status transitions, not per chunk. */}
      <p
        className={styles.liveRegion}
        role="status"
        data-chat-run-status={chat.state.runStatus}
        data-chat-status-label={chat.statusLabel}
      >
        {chat.statusLabel}
      </p>
    </div>
  );
}
