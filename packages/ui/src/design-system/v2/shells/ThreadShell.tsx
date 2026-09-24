"use client";

import type { ReactNode } from "react";
import { ConsoleShell, type ConsoleShellProps } from "./ConsoleShell";
import { cn } from "../../../lib/utils";

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: ReactNode;
  meta?: string;
};

export interface ThreadShellProps extends Omit<ConsoleShellProps, "children"> {
  /** Thread header — session title, breadcrumb, or workspace context. */
  threadHeader?: ReactNode;
  /** Empty/home state when no messages. Preferred over messages when provided. */
  emptyState?: ReactNode;
  /** Loaded conversation messages. Ignored when emptyState is shown. */
  messages?: readonly ThreadMessage[];
  /** Error state for thread load failure. */
  errorState?: ReactNode;
  /** Composer dock — typically a V2Composer. Renders pinned at bottom. */
  composer: ReactNode;
  /** Optional content shown when messages empty but not in emptyState — fallback. */
  children?: ReactNode;
  /** Thread pane className for specimens. */
  threadClassName?: string;
}

function ThreadHeaderWrap({ children }: { children: ReactNode }) {
  return (
    <div className="thread-header flex h-[48px] shrink-0 items-center gap-3 border-b border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] px-6" data-v2-pattern="page-header">
      {children}
    </div>
  );
}

function MessageBubble({ message }: { message: ThreadMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("thread-message flex gap-3", isUser && "thread-message--user")}>
      <div
        className={cn(
          "thread-avatar grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
          isUser
            ? "border-[var(--v2-border-strong)] bg-[var(--v2-active)] text-[var(--v2-text-primary)]"
            : "border-[var(--v2-border-subtle)] bg-[var(--v2-raised)] text-[var(--v2-text-secondary)]",
        )}
        aria-hidden
      >
        {isUser ? "U" : "E"}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "thread-bubble rounded-[var(--v2-radius-raised)] border px-4 py-3 text-[14px] leading-6",
            isUser ? "border-[var(--v2-border-default)] bg-[var(--v2-surface)]" : "border-[var(--v2-border-subtle)] bg-[var(--v2-raised)]",
          )}
          style={{ fontFamily: "var(--font-geist-sans)" }}
        >
          <div className="text-[var(--v2-text-primary)]">{message.content}</div>
          {message.meta ? <div className="mt-2 text-[12px] leading-4 text-[var(--v2-text-tertiary)]">{message.meta}</div> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Production V2 Thread / Chat Shell — reuses V2 Workspace Sidebar (256/56) and unified V2Composer.
 * Composer container and textarea never get a focus box; caret is sufficient per pilot baseline.
 * Composer is docked stable at bottom, message region owns scroll, no 236px/24px DL1 radius.
 */
export function ThreadShell({
  threadHeader,
  emptyState,
  messages,
  errorState,
  composer,
  children,
  threadClassName,
  ...shellProps
}: ThreadShellProps) {
  const hasError = !!errorState;
  const hasEmpty = !!emptyState && !hasError && (!messages || messages.length === 0);
  const hasMessages = !!messages && messages.length > 0 && !hasError && !hasEmpty;

  return (
    <ConsoleShell {...shellProps}>
      <div className={cn("thread-shell flex min-h-0 flex-1 flex-col", threadClassName)} style={{ minHeight: 0 }}>
        {threadHeader ? <ThreadHeaderWrap>{threadHeader}</ThreadHeaderWrap> : null}

        {/* Message/content region — owns scroll, composer stays pinned */}
        <div className="thread-content min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6" tabIndex={0} role="region" aria-label="Conversation">
          {hasError ? (
            <div className="thread-error mx-auto max-w-[720px] rounded-[var(--v2-radius-raised)] border border-[var(--v2-border-default)] bg-[var(--v2-surface)] p-6">
              {errorState}
            </div>
          ) : hasEmpty ? (
            <div className="thread-empty mx-auto flex max-w-[720px] flex-1 flex-col items-center justify-center py-16 text-center">
              {emptyState}
            </div>
          ) : hasMessages ? (
            <div className="thread-messages mx-auto flex max-w-[720px] flex-col gap-6">{messages!.map((m) => <MessageBubble key={m.id} message={m} />)}</div>
          ) : children ? (
            <div className="thread-custom mx-auto max-w-[720px]">{children}</div>
          ) : (
            <div className="thread-empty mx-auto flex max-w-[720px] flex-1 flex-col items-center justify-center py-16 text-center">
              <p className="text-[14px] text-[var(--v2-text-secondary)]">No thread content — provide emptyState, messages, or children.</p>
            </div>
          )}
        </div>

        {/* Composer dock — stable, not floating, 12px radius per V2 raised */}
        <div className="thread-composer-dock shrink-0 border-t border-[var(--v2-border-subtle)] bg-[var(--v2-surface)] px-6 py-4">
          <div className="thread-composer-inner mx-auto max-w-[720px]">{composer}</div>
        </div>
      </div>
    </ConsoleShell>
  );
}

/** Prebuilt empty/home state for specimens. */
export function ThreadEmptyState({
  title = "How can I help you today?",
  description = "Start a new thread. Your conversation, model choice, and tools stay with this session.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="grid h-10 w-10 place-items-center rounded-full border border-[var(--v2-border-default)] bg-[var(--v2-raised)] text-[var(--v2-text-primary)]">E</div>
      <h2 className="text-[20px] font-semibold leading-7 text-[var(--v2-text-primary)]" style={{ fontFamily: "var(--font-geist-sans)", letterSpacing: "-0.02em" }}>
        {title}
      </h2>
      <p className="max-w-[480px] text-[13px] leading-5 text-[var(--v2-text-secondary)]">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Simple error state. */
export function ThreadErrorState({ message = "Thread could not be loaded.", retryLabel = "Retry", onRetry }: { message?: string; retryLabel?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] font-medium text-[var(--v2-text-primary)]">Something went wrong</p>
      <p className="text-[13px] leading-5 text-[var(--v2-text-secondary)]">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="h-8 w-fit rounded-[var(--v2-radius-base)] border border-[var(--v2-border-default)] bg-[var(--v2-surface)] px-3 text-[13px] text-[var(--v2-text-secondary)] hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v2-focus)]">
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
