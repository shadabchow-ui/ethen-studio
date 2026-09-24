"use client";

import * as React from "react";
import { Icon } from "../../../icons";
import { EdsChip } from "../primitives/Chrome";
import { EdsMenu } from "../primitives/Menu";

export type ComposerVariant = "prose" | "work" | "inline";
export type ComposerStatus = "idle" | "submitting" | "streaming";

export interface ComposerAttachment {
  id: string;
  name: string;
  detail?: string;
}

export interface ComposerAttachmentOption {
  id: string;
  label: string;
  description?: string;
}

export interface ComposerTool {
  id: string;
  label: string;
  description?: string;
}

export interface ComposerProps {
  variant: ComposerVariant;
  label?: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop?: () => void;
  status?: ComposerStatus;
  disabled?: boolean;
  error?: string;
  onRetry?: () => void;
  attachments?: readonly ComposerAttachment[];
  attachmentOptions?: readonly ComposerAttachmentOption[];
  onAttachmentAdd?: (option: ComposerAttachmentOption) => void;
  onAttachmentRemove?: (attachment: ComposerAttachment) => void;
  onFilesDropped?: (files: File[]) => void;
  tools?: readonly ComposerTool[];
  activeToolIds?: readonly string[];
  onToolToggle?: (id: string) => void;
  modelTrigger?: React.ReactNode;
  submitOnEnter?: boolean;
  /**
   * D15-J06 — optional text label for the send button (e.g. the marketing
   * intent composer). Defaults to the glyph-only send button.
   */
  submitLabel?: string;
  id?: string;
  className?: string;
}

export const COMPOSER_PLACEHOLDER = "What would you like to get done?";

const DEFAULT_ATTACHMENT_OPTIONS: readonly ComposerAttachmentOption[] = [
  { id: "file", label: "Attach file", description: "Files and documents" },
  { id: "image", label: "Attach image", description: "Screenshots and photos" },
  { id: "context", label: "Add context", description: "Reference material" },
];

function closeAndRefocus(setOpen: (open: boolean) => void, trigger: React.RefObject<HTMLButtonElement | null>) {
  setOpen(false);
  trigger.current?.focus();
}

export const Composer = React.forwardRef<HTMLTextAreaElement, ComposerProps>(
  (
    {
      variant,
      label = "Message composer",
      placeholder = COMPOSER_PLACEHOLDER,
      value,
      onValueChange,
      onSubmit,
      onStop,
      status = "idle",
      disabled = false,
      error,
      onRetry,
      attachments = [],
      attachmentOptions = DEFAULT_ATTACHMENT_OPTIONS,
      onAttachmentAdd,
      onAttachmentRemove,
      onFilesDropped,
      tools = [],
      activeToolIds = [],
      onToolToggle,
      modelTrigger,
      submitOnEnter = true,
      submitLabel,
      id: idProp,
      className,
    },
    ref,
  ) => {
    const generated = React.useId();
    const id = idProp ?? `eds-composer-${generated.replace(/[^a-zA-Z0-9]/g, "")}`;
    const errorId = error ? `${id}-error` : undefined;
    const hintId = `${id}-hint`;
    const liveId = `${id}-live`;

    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const composing = React.useRef(false);
    const [attachOpen, setAttachOpen] = React.useState(false);
    const [toolsOpen, setToolsOpen] = React.useState(false);
    const [dragActive, setDragActive] = React.useState(false);
    const [dragAnnouncement, setDragAnnouncement] = React.useState("");
    const dragDepth = React.useRef(0);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const autoGrow = React.useCallback(() => {
      const node = innerRef.current;
      if (!node) return;
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    }, []);

    React.useLayoutEffect(() => {
      autoGrow();
    }, [autoGrow, value, variant]);

    const attachTrigger = React.useRef<HTMLButtonElement | null>(null);
    const toolsTrigger = React.useRef<HTMLButtonElement | null>(null);

    const streaming = status === "streaming";
    const submitting = status === "submitting";
    const busy = submitting || streaming;
    const interactive = !disabled && !submitting;

    function submit() {
      if (disabled || submitting) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      onSubmit(value);
    }

    function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (event.key === "Enter" && !event.shiftKey) {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          submit();
          return;
        }
        if (!submitOnEnter) return;
        if (composing.current || event.nativeEvent.isComposing) return;
        event.preventDefault();
        submit();
      }
    }

    function onDragEnter(event: React.DragEvent) {
      if (!interactive || !onFilesDropped) return;
      if (![...(event.dataTransfer.types ?? [])].includes("Files")) return;
      event.preventDefault();
      dragDepth.current += 1;
      if (!dragActive) {
        setDragActive(true);
        setDragAnnouncement("Drop files to attach them to this message.");
      }
    }

    function onDragOver(event: React.DragEvent) {
      if (!dragActive) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }

    function onDragLeave(event: React.DragEvent) {
      if (!dragActive) return;
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) {
        setDragActive(false);
        setDragAnnouncement("");
      }
    }

    function onDrop(event: React.DragEvent) {
      if (!dragActive) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      const files = [...(event.dataTransfer.files ?? [])];
      if (files.length > 0) {
        setDragAnnouncement(`${files.length} file${files.length === 1 ? "" : "s"} added.`);
        onFilesDropped?.(files);
      } else {
        setDragAnnouncement("");
      }
      innerRef.current?.focus();
    }

    const describedBy = [errorId, hintId].filter(Boolean).join(" ");

    return (
      <div
        className={[
          "eds-composer",
          `eds-composer--${variant}`,
          streaming ? "eds-composer--streaming" : "",
          dragActive ? "eds-composer--drag" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {modelTrigger ? (
          <div className="eds-composer__model" data-eds-composer-model>
            {modelTrigger}
          </div>
        ) : null}
        <textarea
          ref={setRefs}
          id={id}
          aria-label={label}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          aria-busy={busy || undefined}
          placeholder={placeholder}
          value={value}
          disabled={disabled || submitting}
          rows={variant === "prose" ? 3 : variant === "work" ? 2 : 1}
          onChange={(event) => {
            onValueChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          className="eds-composer__input"
        />
        {attachments.length > 0 ? (
          <ul aria-label="Attachments" className="eds-composer__attachments">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="eds-composer__attachment">
                <EdsChip
                  onRemove={onAttachmentRemove ? () => onAttachmentRemove(attachment) : undefined}
                  removeLabel={`Remove ${attachment.name}`}
                >
                  {attachment.name}
                  {attachment.detail ? <span className="eds-composer__detail">{attachment.detail}</span> : null}
                </EdsChip>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="eds-composer__error">
            <span>{error}</span>
            {onRetry ? (
              <button type="button" onClick={onRetry} className="eds-composer__retry">
                Retry
              </button>
            ) : null}
          </p>
        ) : null}
        <div className="eds-composer__toolbar">
          <div className="eds-composer__tools">
            {onAttachmentAdd || onFilesDropped ? (
              <span className="eds-composer__menu-anchor">
                <button
                  ref={attachTrigger}
                  type="button"
                  aria-label="Add attachment"
                  aria-haspopup="menu"
                  aria-expanded={attachOpen}
                  disabled={!interactive}
                  onClick={() => {
                    setToolsOpen(false);
                    setAttachOpen((open) => !open);
                  }}
                  className="eds-composer__icon-button"
                >
                  <span aria-hidden>
                    <Icon name="plus" size={16} />
                  </span>
                </button>
                {attachOpen ? (
                  <span className="eds-composer__menu-layer">
                    <span
                      aria-hidden
                      className="eds-composer__menu-backdrop"
                      onMouseDown={() => closeAndRefocus(setAttachOpen, attachTrigger)}
                    />
                    <span className="eds-composer__menu">
                      <EdsMenu
                        label="Add attachment"
                        items={attachmentOptions.map((option) => ({
                          label: option.label,
                          onSelect: () => {
                            onAttachmentAdd?.(option);
                            closeAndRefocus(setAttachOpen, attachTrigger);
                          },
                        }))}
                        onClose={() => closeAndRefocus(setAttachOpen, attachTrigger)}
                      />
                    </span>
                  </span>
                ) : null}
              </span>
            ) : null}
            {tools.length > 0 ? (
              <span className="eds-composer__menu-anchor">
                <button
                  ref={toolsTrigger}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={toolsOpen}
                  disabled={!interactive}
                  onClick={() => {
                    setAttachOpen(false);
                    setToolsOpen((open) => !open);
                  }}
                  className={[
                    "eds-composer__tools-button",
                    activeToolIds.length > 0 ? "eds-composer__tools-button--active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  Tools
                  {activeToolIds.length > 0 ? (
                    <span aria-hidden className="eds-composer__tools-count">
                      {activeToolIds.length}
                    </span>
                  ) : null}
                  <span aria-hidden className="eds-composer__tools-chevron">
                    <Icon name="chevron-down" size={16} />
                  </span>
                </button>
                {toolsOpen ? (
                  <span className="eds-composer__menu-layer">
                    <span
                      aria-hidden
                      className="eds-composer__menu-backdrop"
                      onMouseDown={() => closeAndRefocus(setToolsOpen, toolsTrigger)}
                    />
                    <span className="eds-composer__menu">
                      <EdsMenu
                        label="Tools"
                        items={tools.map((tool) => ({
                          label: `${tool.label}${activeToolIds.includes(tool.id) ? " ✓" : ""}`,
                          onSelect: () => {
                            onToolToggle?.(tool.id);
                            closeAndRefocus(setToolsOpen, toolsTrigger);
                          },
                        }))}
                        onClose={() => closeAndRefocus(setToolsOpen, toolsTrigger)}
                      />
                    </span>
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
          <span id={hintId} className="eds-composer__hint">
            {streaming ? "Streaming — review stays readable." : "Enter to send · Shift+Enter for a new line."}
          </span>
          {streaming ? (
            <button
              type="button"
              aria-label="Stop generating"
              onClick={onStop}
              className="eds-composer__send eds-composer__send--stop"
            >
              <span aria-hidden className="eds-composer__send-glyph">
                ■
              </span>
            </button>
          ) : (
            <button
              type="button"
              aria-label={submitLabel ?? "Send message"}
              aria-busy={submitting || undefined}
              disabled={!interactive || value.trim().length === 0}
              onClick={submit}
              className={[
                "eds-composer__send",
                submitLabel ? "eds-composer__send--labeled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {submitLabel ? (
                <span className="eds-composer__send-label">{submitLabel}</span>
              ) : (
                <span aria-hidden className="eds-composer__send-glyph">
                  ↑
                </span>
              )}
            </button>
          )}
        </div>
        <span id={liveId} role="status" className="eds-composer__sr">
          {dragAnnouncement}
          {streaming ? "Streaming response." : ""}
        </span>
        <span aria-hidden className="eds-composer__drop-hint">
          Drop files to attach
        </span>
      </div>
    );
  },
);
Composer.displayName = "Composer";
