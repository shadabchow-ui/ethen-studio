"use client";

/**
 * CHAT_A1 — the Ethen Chat composer. ONE component, two placements.
 *
 * The empty state and the active conversation mount the same composer; the
 * only difference is a `placement` attribute that changes max-width and the
 * top rule. Building a second "docked composer" is how the two surfaces drift
 * apart, and it is explicitly out of bounds in the spec.
 *
 * Deliberate differences from the supplied reference:
 *  - the footer carries ONE model control, not a row of pills: intelligence
 *    level lives inside the model menu, because Ethen already owns routing.
 *  - Send is a soft square (8px), not a circle, and is quiet until there is
 *    something to send.
 *  - Attachments are hairline tiles inside the composer, not cards under it.
 *
 * Everything is a local mock. Nothing calls a runtime.
 */
import * as React from "react";
import { Icon } from "../icons";
import { ChatIcon, type ChatIconName } from "./chat-icons";
import { ChatMenu, type ChatMenuGroup } from "./chat-menu";
import {
  ATTACHMENT_ACTIONS,
  CHAT_MODELS,
  CHAT_TOOLS,
  COMPOSER_PLACEHOLDER,
  THINKING_LEVELS,
  type ChatAttachment,
  type ThinkingLevel,
} from "./chat-fixtures";
import styles from "./chat-composer.module.css";

export type ComposerMenu = "attach" | "tools" | "model" | null;

import { composerInputCap, noticeKeyOf, shouldSendOnEnter } from "./chat-interaction";

export { composerInputCap, shouldSendOnEnter };

/** CHAT_A3 — true when the primary pointer is coarse touch without hover (phone-class). */
export function useTouchPrimary(): boolean {
  const [touch, setTouch] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(pointer: coarse) and (hover: none)");
    const sync = () => setTouch(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return touch;
}

function attachmentKindForFile(file: File): ChatAttachment["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (/\.(ts|tsx|js|jsx|css|json|py|md|csv)$/i.test(file.name) || file.type.startsWith("text/")) return "code";
  return "document";
}

function describeFile(file: File): string {
  const kb = Math.max(1, Math.round(file.size / 1024));
  const kind = file.type.split("/")[1]?.toUpperCase() ?? "File";
  return `${kind} · ${kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}`;
}

const ATTACHMENT_ICON: Record<ChatAttachment["kind"], ChatIconName> = {
  image: "image",
  document: "document",
  code: "code",
};

export type ChatComposerProps = Readonly<{
  placement?: "centered" | "docked";
  initialValue?: string;
  initialAttachments?: readonly ChatAttachment[];
  initialTools?: readonly string[];
  initialMenu?: ComposerMenu;
  initialModelId?: string;
  generating?: boolean;
  /** A local, composer-scoped failure — never a full-page error screen. */
  notice?: Readonly<{ title: string; detail: string; action: string; tone: "danger" | "attention" }>;
  /** Shown as quiet context above the input when a project is active. */
  projectName?: string | null;
  onSend?: (value: string) => void;
  onStop?: () => void;
  /** The empty state labels the composer with the greeting instead. */
  ariaLabel?: string;
  /** CHAT_A2_1 controlled overrides — the shell passes these so run state has one owner. */
  value?: string;
  attachments?: readonly ChatAttachment[];
  tools?: readonly string[];
  modelId?: string;
  thinking?: ThinkingLevel;
  /** When provided, Send availability is decided by the owner (attachment gate + run guard). */
  canSend?: boolean;
  onValueChange?: (value: string) => void;
  onAttachmentsChange?: (attachments: readonly ChatAttachment[]) => void;
  onToolsChange?: (tools: readonly string[]) => void;
  onModelChange?: (modelId: string) => void;
  onThinkingChange?: (thinking: ThinkingLevel) => void;
  /** CHAT_A2_1 recovery action for the local failure notice (e.g. Retry). */
  onNoticeAction?: () => void;
}>;

export function ChatComposer({
  placement = "centered",
  initialValue = "",
  initialAttachments = [],
  initialTools = [],
  initialMenu = null,
  initialModelId = CHAT_MODELS[0].id,
  generating = false,
  notice,
  projectName = null,
  onSend,
  onStop,
  ariaLabel = "Message Ethen",
  value: controlledValue,
  attachments: controlledAttachments,
  tools: controlledTools,
  modelId: controlledModelId,
  thinking: controlledThinking,
  canSend: controlledCanSend,
  onValueChange,
  onAttachmentsChange,
  onToolsChange,
  onModelChange,
  onThinkingChange,
  onNoticeAction,
}: ChatComposerProps) {
  const [internalValue, setInternalValue] = React.useState(initialValue);
  const [internalAttachments, setInternalAttachments] = React.useState<readonly ChatAttachment[]>(initialAttachments);
  const [internalTools, setInternalTools] = React.useState<readonly string[]>(initialTools);
  const [menu, setMenu] = React.useState<ComposerMenu>(initialMenu);
  const [internalModelId, setInternalModelId] = React.useState(initialModelId);
  const [internalThinking, setInternalThinking] = React.useState<ThinkingLevel>("Think");
  // CHAT_A5.1 — dismissal is keyed to the notice instance, so dismissing
  // one notice can never hide its successor.
  const [dismissedNoticeKey, setDismissedNoticeKey] = React.useState<string | null>(null);
  const activeNoticeKey = notice ? noticeKeyOf(notice) : null;
  const showNotice = notice !== undefined && notice !== null && activeNoticeKey !== dismissedNoticeKey;
  const [dropActive, setDropActive] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const touchPrimary = useTouchPrimary();

  // Controlled when the shell passes the prop; otherwise the specimen-local initial state applies.
  const value = controlledValue ?? internalValue;
  const attachments = controlledAttachments ?? internalAttachments;
  const tools = controlledTools ?? internalTools;
  const modelId = controlledModelId ?? internalModelId;
  const thinking = controlledThinking ?? internalThinking;
  // Run state has one owner: the shell's `generating`. No local running copy.
  const running = generating;

  const setValue = (next: string) => {
    if (controlledValue === undefined) setInternalValue(next);
    onValueChange?.(next);
  };
  const setAttachments = React.useCallback(
    (next: readonly ChatAttachment[] | ((current: readonly ChatAttachment[]) => readonly ChatAttachment[])) => {
      const resolved = typeof next === "function" ? (next as (current: readonly ChatAttachment[]) => readonly ChatAttachment[])(attachments) : next;
      if (controlledAttachments === undefined) setInternalAttachments(resolved);
      onAttachmentsChange?.(resolved);
    },
    [attachments, controlledAttachments, onAttachmentsChange],
  );
  const setTools = (next: readonly string[] | ((current: readonly string[]) => readonly string[])) => {
    const resolved = typeof next === "function" ? (next as (current: readonly string[]) => readonly string[])(tools) : next;
    if (controlledTools === undefined) setInternalTools(resolved);
    onToolsChange?.(resolved);
  };
  const setModelId = (next: string) => {
    if (controlledModelId === undefined) setInternalModelId(next);
    onModelChange?.(next);
  };
  const setThinking = (next: ThinkingLevel) => {
    if (controlledThinking === undefined) setInternalThinking(next);
    onThinkingChange?.(next);
  };

  const model = CHAT_MODELS.find((candidate) => candidate.id === modelId) ?? CHAT_MODELS[0];
  // Send gate: needs sendable content, every attachment ready, and no active run.
  const blockedAttachment = attachments.some((attachment) => (attachment.state ?? "ready") !== "ready");
  const hasSendable = value.trim().length > 0 || attachments.some((attachment) => (attachment.state ?? "ready") === "ready");
  const ready = controlledCanSend ?? (hasSendable && !blockedAttachment && !running);

  // Auto-grow, capped at the spec's 320px — or 32% of the VISIBLE viewport
  // when the mobile keyboard is open — before the textarea scrolls itself.
  const resize = React.useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, composerInputCap())}px`;
  }, []);

  React.useLayoutEffect(resize, [value, resize]);

  // A height measured before the stylesheet or the webfont has landed is
  // wrong and would never be corrected, because nothing else re-measures an
  // untouched composer. Re-measure once fonts resolve, on viewport changes
  // (wrap width moves the wrap count), and on visualViewport changes (the
  // mobile keyboard resizing the visible area).
  React.useEffect(() => {
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    document.fonts?.ready.then(resize).catch(() => undefined);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [resize]);

  const send = () => {
    // Duplicate-submit guard: a send that is not ready (blocked attachment,
    // empty, or already running) is ignored before touching the draft.
    if (!ready || running) return;
    onSend?.(value.trim());
    if (controlledValue === undefined) {
      // Uncontrolled specimens clear locally; the controlled shell clears via
      // the controller only after local submission acceptance.
      setValue("");
      setAttachments((current) => current.filter((attachment) => (attachment.state ?? "ready") !== "ready"));
    }
    // Keep focus in the composer so repeated Enter cannot escape mid-flow.
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSendOnEnter({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, touchPrimary })) {
      event.preventDefault();
      send();
    }
  };

  // CHAT_A3 — local-only attachments: picked, pasted or dropped files become
  // tiles backed by a local object reference. Nothing uploads; a tile flips
  // to ready after a short local beat, and a failed tile can retry the same
  // local path. No storage backend, no network.
  const addLocalFiles = React.useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) return;
      const fresh: ChatAttachment[] = files.slice(0, 4).map((file, index) => ({
        id: `local-${Date.now()}-${index}`,
        name: file.name || "Pasted image",
        kind: attachmentKindForFile(file),
        meta: describeFile(file),
        state: "uploading" as const,
      }));
      setAttachments((current) => [...current, ...fresh]);
      window.setTimeout(() => {
        setAttachments((current) =>
          current.map((item) => (fresh.some((tile) => tile.id === item.id) ? { ...item, state: "ready" as const } : item)),
        );
      }, 600);
    },
    [setAttachments],
  );

  const retryFailedTiles = React.useCallback(() => {
    setAttachments((current) =>
      current.map((item) => (item.state === "failed" ? { ...item, state: "uploading" as const } : item)),
    );
    window.setTimeout(() => {
      setAttachments((current) =>
        current.map((item) => (item.state === "uploading" ? { ...item, state: "ready" as const } : item)),
      );
    }, 600);
  }, [setAttachments]);

  const toolGroups: readonly ChatMenuGroup[] = [
    {
      selectMode: "checkbox",
      items: CHAT_TOOLS.map((tool) => ({
        id: tool.id,
        label: tool.name,
        detail: tool.detail,
        selected: tools.includes(tool.id),
      })),
    },
  ];

  // CHAT_A3 — Current model first, intelligence second, everything else last,
  // so speed/depth naming never competes across the two choices. Both are
  // radio groups; a pick applies to the NEXT submission, never a live run.
  const otherModels = CHAT_MODELS.filter((candidate) => candidate.id !== modelId);
  const modelGroups: readonly ChatMenuGroup[] = [
    {
      label: "Current model",
      selectMode: "radio",
      items: [
        {
          id: `model:${model.id}`,
          label: model.name,
          detail: model.summary,
          selected: true,
        },
      ],
    },
    {
      label: "Intelligence",
      selectMode: "radio",
      items: THINKING_LEVELS.map((level) => ({
        id: `thinking:${level}`,
        label: level,
        detail:
          level === "Fast" ? "Answer immediately" : level === "Think" ? "Deliberate briefly" : "Deliberate at length",
        selected: level === thinking,
      })),
    },
    {
      label: "Other models",
      selectMode: "radio",
      items: otherModels.map((candidate) => ({
        id: `model:${candidate.id}`,
        label: candidate.name,
        detail: candidate.summary,
        selected: false,
      })),
    },
  ];

  const onModelSelect = (id: string) => {
    if (id.startsWith("model:")) setModelId(id.slice(6));
    if (id.startsWith("thinking:")) setThinking(id.slice(9) as ThinkingLevel);
  };

  // CHAT_A4.1 — the empty-state composer sits under the greeting with open
  // space below it, so its menus open DOWNWARD; the docked composer sits at
  // the viewport bottom, so its menus open UPWARD. The placer still flips on
  // overflow and caps height with internal scroll either way.
  const menuPlacement = placement === "centered" ? "bottom" : "top";

  return (
    <div className={styles.wrap} data-placement={placement}>
      {showNotice && notice ? (
        <div className={styles.notice} data-tone={notice.tone} role="status">
          <div className={styles.noticeText}>
            <strong>{notice.title}</strong>
            <span>{notice.detail}</span>
          </div>
          <div className={styles.noticeActions}>
            <button type="button" className={styles.noticeAction} onClick={onNoticeAction}>
              {notice.action}
            </button>
            <button
              type="button"
              className={styles.noticeDismiss}
              onClick={() => setDismissedNoticeKey(activeNoticeKey)}
              aria-label="Dismiss notice"
            >
              <ChatIcon name="remove" size={14} />
            </button>
          </div>
        </div>
      ) : null}

      <form
        className={styles.composer}
        aria-label={ariaLabel}
        data-drop={dropActive ? "true" : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        onDragOver={(event) => {
          if (event.dataTransfer?.types.includes("Files")) {
            event.preventDefault();
            setDropActive(true);
          }
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event) => {
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (files.length === 0) return;
          event.preventDefault();
          setDropActive(false);
          addLocalFiles(files);
        }}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData?.files ?? []);
          if (files.length === 0) return;
          event.preventDefault();
          addLocalFiles(files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            addLocalFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        {projectName ? (
          <p className={styles.projectContext}>
            <Icon name="folder" size={16} />
            <span>
              Project <strong>{projectName}</strong>
            </span>
          </p>
        ) : null}

        {attachments.length > 0 ? (
          <ul className={styles.attachments} aria-label="Attachments">
            {attachments.map((attachment) => (
              <li key={attachment.id} className={styles.attachment} data-state={attachment.state ?? "ready"}>
                <span className={styles.attachmentIcon} aria-hidden="true">
                  <ChatIcon name={ATTACHMENT_ICON[attachment.kind]} size={16} />
                </span>
                <span className={styles.attachmentText}>
                  <span className={styles.attachmentName}>{attachment.name}</span>
                  <span className={styles.attachmentMeta}>
                    {attachment.state === "uploading"
                      ? "Uploading…"
                      : attachment.state === "failed"
                        ? "Upload failed"
                        : attachment.meta}
                  </span>
                  {attachment.state === "failed" ? (
                    <button
                      type="button"
                      className={styles.attachmentRetry}
                      aria-label={`Retry ${attachment.name}`}
                      onClick={retryFailedTiles}
                    >
                      Retry
                    </button>
                  ) : null}
                </span>
                <button
                  type="button"
                  className={styles.attachmentRemove}
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => {
                    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
                    // The tile unmounts: land focus back in the textarea
                    // instead of dropping it to <body>.
                    textareaRef.current?.focus();
                  }}
                >
                  <ChatIcon name="remove" size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {tools.length > 0 ? (
          <ul className={styles.activeTools} aria-label="Active tools">
            {tools.map((toolId) => {
              const tool = CHAT_TOOLS.find((candidate) => candidate.id === toolId);
              if (!tool) return null;
              return (
                <li key={toolId} className={styles.activeTool}>
                  <span>{tool.name}</span>
                  <button
                    type="button"
                    aria-label={`Turn off ${tool.name}`}
                    onClick={() => setTools((current) => current.filter((id) => id !== toolId))}
                  >
                    <ChatIcon name="remove" size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <textarea
          ref={textareaRef}
          className={styles.input}
          value={value}
          rows={1}
          placeholder={COMPOSER_PLACEHOLDER}
          aria-label={ariaLabel}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <ChatMenu
              label="Add an attachment"
              placement={menuPlacement}
              align="start"
              open={menu === "attach"}
              onOpenChange={(next) => setMenu(next ? "attach" : null)}
              triggerClassName={styles.iconTrigger}
              trigger={<Icon name="plus" size={16} />}
              groups={[{ items: ATTACHMENT_ACTIONS.map((action) => ({ id: action.id, label: action.label, detail: action.detail })) }]}
              footer="Design lab — picked files stay local, nothing is uploaded."
              onSelect={(id) => {
                if (id === "file" || id === "image") {
                  if (fileRef.current) fileRef.current.accept = id === "image" ? "image/*" : "";
                  fileRef.current?.click();
                }
              }}
            />
            <ChatMenu
              label="Tools"
              placement={menuPlacement}
              align="start"
              open={menu === "tools"}
              onOpenChange={(next) => setMenu(next ? "tools" : null)}
              trigger={
                <>
                  <ChatIcon name="tools" size={16} />
                  <span className={styles.triggerLabel}>Tools</span>
                </>
              }
              groups={toolGroups}
              footer="Design-lab preview — tools do not execute here."
              onSelect={(id) =>
                setTools((current) =>
                  current.includes(id) ? current.filter((toolId) => toolId !== id) : [...current, id],
                )
              }
            />
          </div>

          <div className={styles.footerRight}>
            <ChatMenu
              label={`Model: ${model.name}, intelligence ${thinking}`}
              placement={menuPlacement}
              align="end"
              open={menu === "model"}
              onOpenChange={(next) => setMenu(next ? "model" : null)}
              triggerClassName={styles.modelTrigger}
              trigger={
                <>
                  <span className={styles.modelName}>{model.name}</span>
                  <span className={styles.modelLevel}>{thinking}</span>
                  <Icon name="chevron-down" size={16} />
                </>
              }
              groups={modelGroups}
              footer="Model names are design-lab placeholders."
              onSelect={onModelSelect}
            />
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Use voice"
              disabled
              title="Voice input is not wired in this lab preview"
            >
              <ChatIcon name="mic" size={18} />
            </button>
            {running ? (
              <button
                type="button"
                className={styles.send}
                data-state="generating"
                aria-label="Stop generating"
                onClick={() => {
                  onStop?.();
                }}
              >
                <ChatIcon name="stop" size={18} />
              </button>
            ) : (
              <button
                type="submit"
                className={styles.send}
                data-state={ready ? "ready" : "empty"}
                disabled={!ready}
                aria-label="Send message"
              >
                <ChatIcon name="send" size={18} />
              </button>
            )}
          </div>
        </div>
      </form>

      <p className={styles.hint}>
        {touchPrimary ? (
          <>Send to submit · new lines inside the message</>
        ) : (
          <><kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line</>
        )}
      </p>
    </div>
  );
}
