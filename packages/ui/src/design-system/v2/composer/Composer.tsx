"use client";

import { forwardRef, useId, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../../lib/utils";
import { V2ModelPicker, type V2ModelOption } from "./ModelPicker";
import { V2MenuRow, V2Overlay } from "../primitives";
import styles from "../v2.module.css";

export type V2ComposerTool = { id: string; label: string; disabled?: boolean };
export type V2ComposerAttachment = { id: string; name: string; detail?: string; status?: "ready" | "loading" | "error" };
export type V2ComposerState = "idle" | "sending" | "running" | "error" | "disabled";

export type V2ComposerProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  onSend?: (value: string) => void;
  onStop?: () => void;
  onAttachmentRequest?: () => void;
  onAttachmentRemove?: (attachment: V2ComposerAttachment) => void;
  onVoiceClick?: () => void;
  tools?: readonly V2ComposerTool[];
  onToolSelect?: (tool: V2ComposerTool) => void;
  attachments?: readonly V2ComposerAttachment[];
  models?: readonly V2ModelOption[];
  selectedModelId?: string | null;
  /** Useful when the picker needs to be visible on first render, such as a lab specimen. */
  defaultModelPickerOpen?: boolean;
  onModelSelect?: (model: V2ModelOption) => void;
  contextLabel?: string;
  onContextClick?: () => void;
  modeLabel?: string;
  onModeClick?: () => void;
  state?: V2ComposerState;
  placeholder?: string;
  className?: string;
  /** Optional product extension slot — rendered in toolbar between main controls and send. Enables Code/Studio/Workflow without a fork. */
  extension?: ReactNode;
  /** Compact mode renders a denser 58px-like single-row for footers. Preferred via V2CompactComposer alias. */
  compact?: boolean;
  statusText?: string;
};

function Icon({ children }: { children: ReactNode }) { return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={styles.icon}>{children}</svg>; }

/** Re-exportable subcomponents for product composition without fork. */
export function V2ComposerInput(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(styles.textarea, props.className)} />;
}
export function V2ComposerToolbar({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.composerControls, className)} {...props}>{children}</div>;
}
export function V2ComposerStatus({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "error" }) {
  return <p className={cn(styles.error, tone !== "neutral" && styles[`composerStatus_${tone}` as never])}>{children}</p>;
}
export const V2ComposerModelControl = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  (props: ButtonHTMLAttributes<HTMLButtonElement>, ref: React.ForwardedRef<HTMLButtonElement>) => (
    <button ref={ref} type="button" className={styles.controlButton} {...props} />
  ),
);
V2ComposerModelControl.displayName = "V2ComposerModelControl";
export const V2ComposerAttachControl = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  (props: ButtonHTMLAttributes<HTMLButtonElement>, ref: React.ForwardedRef<HTMLButtonElement>) => (
    <button ref={ref} type="button" aria-label="Attach file" className={styles.iconButton} {...props} />
  ),
);
V2ComposerAttachControl.displayName = "V2ComposerAttachControl";
export const V2ComposerVoiceControl = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  (props: ButtonHTMLAttributes<HTMLButtonElement>, ref: React.ForwardedRef<HTMLButtonElement>) => (
    <button ref={ref} type="button" aria-label="Use voice input" className={styles.iconButton} {...props} />
  ),
);
V2ComposerVoiceControl.displayName = "V2ComposerVoiceControl";
export const V2ComposerSend = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { running?: boolean; sending?: boolean }
>(
  (
    { running, sending: _sending, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
      running?: boolean;
      sending?: boolean;
    },
    ref: React.ForwardedRef<HTMLButtonElement>,
  ) => (
    <button ref={ref} className={cn(styles.sendButton, running && styles.stopButton, className)} {...props}>
      {children}
    </button>
  ),
);
V2ComposerSend.displayName = "V2ComposerSend";

/** Compact alias — same family, denser footprint for footers. Uses 12px radius (raised), not DL1 24px. */
export function V2CompactComposer(props: V2ComposerProps) {
  return <V2Composer {...props} compact className={cn(props.className)} />;
}

export function V2Composer({
  value: valueProp, onValueChange, onSend, onStop, onAttachmentRequest, onAttachmentRemove, onVoiceClick,
  tools = [], onToolSelect, attachments = [], models = [], selectedModelId = null, defaultModelPickerOpen = false, onModelSelect,
  contextLabel = "Context", onContextClick, modeLabel = "Ask", onModeClick, state = "idle",
  placeholder = "Message Ethen", className, extension, compact, statusText,
}: V2ComposerProps) {
  const textareaId = useId();
  const [internalValue, setInternalValue] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(defaultModelPickerOpen);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const value = valueProp ?? internalValue;
  const selectedModel = models.find((model) => model.id === selectedModelId);
  const disabled = state === "disabled" || state === "sending";
  const running = state === "running";
  const setValue = (next: string) => { if (valueProp === undefined) setInternalValue(next); onValueChange?.(next); };
  const submit = (event?: FormEvent) => { event?.preventDefault(); if (running) { onStop?.(); return; } if (!disabled && value.trim()) onSend?.(value); };

  return (
    <form
      className={cn(styles.composer, compact && styles.composerCompact, state === "error" && styles.composerError, className)}
      onSubmit={submit}
      aria-busy={state === "sending" || undefined}
      data-compact={compact ? "true" : undefined}
      data-state={state}
      data-v2-pattern="composer-surface"
    >
      {attachments.length > 0 && <div className={styles.attachments} aria-label="Attachments">{attachments.map((attachment) => <span key={attachment.id} className={cn(styles.attachment, attachment.status === "error" && styles.attachmentError)}><span className={styles.attachmentLabel}>{attachment.status === "loading" ? "Uploading " : ""}{attachment.name}{attachment.detail ? ` · ${attachment.detail}` : ""}</span>{onAttachmentRemove && <button type="button" className={styles.attachmentRemove} onClick={() => onAttachmentRemove(attachment)} aria-label={`Remove ${attachment.name}`}>×</button>}</span>)}</div>}
      <label className="sr-only" htmlFor={textareaId}>Message Ethen</label>
      <textarea id={textareaId} value={value} disabled={disabled} rows={1} placeholder={placeholder} className={styles.textarea} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} />
      {state === "error" && <p className={styles.error}>Message could not be sent. Update the prompt and try again.</p>}
      {statusText ? <p className={styles.composerStatus} role="status">{statusText}</p> : null}
      <div className={styles.composerControls}>
        <div className={styles.controlGroup}>
          <div className={styles.anchor}>
            <button type="button" className={styles.iconButton} aria-label="Attach file" disabled={disabled} onClick={onAttachmentRequest}><Icon><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Icon></button>
            {tools.length > 0 && <button type="button" className={styles.controlButton} aria-haspopup="menu" aria-expanded={toolsOpen} disabled={disabled} onClick={() => setToolsOpen((open) => !open)}>Tools <span>⌄</span></button>}
            {toolsOpen && <V2Overlay className={styles.toolsMenu} role="menu" aria-label="Tools">{tools.map((tool) => <V2MenuRow key={tool.id} role="menuitem" disabled={tool.disabled} onClick={() => { onToolSelect?.(tool); setToolsOpen(false); }}>{tool.label}</V2MenuRow>)}</V2Overlay>}
          </div>
          <div className={styles.anchor}>
            <button ref={modelTriggerRef} type="button" className={styles.controlButton} aria-haspopup="dialog" aria-expanded={modelsOpen} disabled={disabled || models.length === 0} onClick={() => setModelsOpen((open) => !open)}>{selectedModel?.label ?? "Model"} <span>⌄</span></button>
            <V2ModelPicker options={models} selectedId={selectedModelId} onSelect={(model) => onModelSelect?.(model)} open={modelsOpen} onOpenChange={setModelsOpen} returnFocusRef={modelTriggerRef} className={styles.composerPicker} />
          </div>
          <button type="button" className={styles.controlButton} disabled={disabled} onClick={onContextClick}>{contextLabel}</button>
          <button type="button" className={styles.controlButton} disabled={disabled} onClick={onModeClick}>{modeLabel} <span>⌄</span></button>
        </div>
        {extension ? <div className={styles.composerExtension} aria-label="Product extension">{extension}</div> : null}
        <div className={styles.controlGroup}>
          <button type="button" className={styles.iconButton} aria-label="Use voice input" disabled={disabled} onClick={onVoiceClick}><Icon><rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M4 8a4 4 0 008 0M8 12v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Icon></button>
          <button type={running ? "button" : "submit"} className={cn(styles.sendButton, running && styles.stopButton)} disabled={disabled} onClick={running ? () => onStop?.() : undefined} aria-label={running ? "Stop generating" : state === "sending" ? "Sending message" : "Send message"}>{running ? <span className={styles.stopSquare} /> : state === "sending" ? <span className={styles.spinner} /> : <Icon><path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></Icon>}</button>
        </div>
      </div>
    </form>
  );
}