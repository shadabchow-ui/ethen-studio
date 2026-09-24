"use client";

/**
 * EDS Message — D10 candidate.
 *
 * One canonical message anatomy: 24px avatar, thin structural rail,
 * content at a 720px readable measure, metadata below content. User
 * messages sit slightly raised; assistant messages sit flat on canvas.
 * Hierarchy comes from spacing, type, surface, rail, rule, and metadata —
 * never bubble soup.
 */
import * as React from "react";

export type MessageRole = "user" | "assistant";

export type MessageStatus = "complete" | "streaming" | "error" | "retry";

export interface MessageMeta {
  timestamp?: string;
  version?: string;
  status?: MessageStatus;
  detail?: string;
}

export interface MessageProps {
  role: MessageRole;
  senderName: string;
  senderInitials: string;
  meta?: MessageMeta;
  onRetry?: () => void;
  artifactRef?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  id?: string;
}

function StatusLabel({ status }: { status: MessageStatus }): string {
  switch (status) {
    case "streaming":
      return "Streaming";
    case "error":
      return "Failed";
    case "retry":
      return "Needs retry";
    case "complete":
    default:
      return "Sent";
  }
}

export function Message({
  role,
  senderName,
  senderInitials,
  meta,
  onRetry,
  artifactRef,
  children,
  className,
  id,
}: MessageProps) {
  const status = meta?.status ?? "complete";
  return (
    <article
      id={id}
      aria-label={`${senderName} message`}
      className={["eds-message", `eds-message--${role}`, className].filter(Boolean).join(" ")}
    >
      <span aria-hidden className="eds-message__avatar">
        {senderInitials}
      </span>
      <span aria-hidden className="eds-message__rail" />
      <div className="eds-message__body">
        <p className="eds-message__sender">{senderName}</p>
        <div className="eds-message__content">{children}</div>
        {artifactRef ? <div className="eds-message__artifact">{artifactRef}</div> : null}
        <footer className="eds-message__meta">
          {meta?.timestamp ? <time className="eds-message__timestamp">{meta.timestamp}</time> : null}
          {meta?.version ? <span className="eds-message__version">{meta.version}</span> : null}
          <span className="eds-message__status" aria-live={status === "streaming" ? "polite" : undefined}>
            {StatusLabel({ status })}
          </span>
          {meta?.detail ? <span className="eds-message__detail">{meta.detail}</span> : null}
          {status === "retry" || status === "error" ? (
            <button type="button" className="eds-message__retry" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </footer>
      </div>
    </article>
  );
}
