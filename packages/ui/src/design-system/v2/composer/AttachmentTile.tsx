"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MimeIcon({ mimeType, size = 16 }: { mimeType?: string; size?: number }) {
  const path = (() => {
    if (!mimeType) return "M4 2h6l4 4v10H4V2z";
    if (mimeType.startsWith("image/")) return "M2 2h12v12H2zM2 9.5l3.5-3.5 2.5 2.5L10 6l4 4";
    if (mimeType === "application/pdf") return "M4 2h6l4 4v10H4V2zM4 7h8M4 10h6M4 13h4";
    if (mimeType === "application/json") return "M5 2H4a1 1 0 00-1 1v3a2 2 0 01-2 2 2 2 0 012 2v3a1 1 0 001 1h1M11 2h1a1 1 0 011 1v3a2 2 0 002 2 2 2 0 01-2 2v3a1 1 0 01-1 1h-1";
    if (mimeType.startsWith("text/")) return "M4 2h6l4 4v10H4V2zM4 7h8M4 10h6";
    if (mimeType.startsWith("audio/")) return "M7 12.5a2 2 0 100-5M7 12.5V4.5l8-2v9M15 11.5a2 2 0 100-5";
    if (mimeType.startsWith("video/")) return "M2 4h9v8H2zM11 6l4-2v8l-4-2V6z";
    return "M4 2h6l4 4v10H4V2z";
  })();
  return (
    <svg viewBox="0 0 16 16" fill="none" width={size} height={size} aria-hidden className="shrink-0">
      <path d={path} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type V2AttachmentStatus = "ready" | "loading" | "error";
export type V2AttachmentType = "file" | "image";

export interface V2AttachmentProps {
  name: string;
  bytes?: number;
  mimeType?: string;
  type?: V2AttachmentType;
  status?: V2AttachmentStatus;
  progress?: number; // 0-100 for loading
  previewSrc?: string;
  onRemove?: () => void;
  onPreview?: () => void;
  className?: string;
  context?: "composer" | "message";
}

/** Production V2 attachment tile — 56px, 6px radius, image/file variants, progress/error, preview, remove. */
export function V2AttachmentTile({
  name,
  bytes,
  mimeType,
  type,
  status = "ready",
  progress,
  previewSrc,
  onRemove,
  onPreview,
  className,
  context = "composer",
}: V2AttachmentProps) {
  const resolvedType: V2AttachmentType = type ?? (mimeType?.startsWith("image/") ? "image" : "file");
  const isImage = resolvedType === "image";
  const label = `${name}${bytes !== undefined ? ` · ${formatFileSize(bytes)}` : ""}${mimeType ? ` · ${mimeType}` : ""}`;

  return (
    <div className={cn("relative shrink-0", className)}>
      {onPreview ? (
        <button
          type="button"
          aria-label={isImage ? `Preview image attachment: ${name}` : `Preview file attachment: ${name}`}
          onClick={onPreview}
          className={cn(
            "block h-14 w-14 overflow-hidden rounded-[var(--v2-radius-base)] border bg-[var(--v2-raised)] transition-colors",
            status === "error" ? "border-[var(--v2-status-danger)]" : "border-[var(--v2-border-default)]",
            "cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]"
          )}
          title={label}
        >
          {isImage && previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- deterministic data-URI preview, no optimization needed
            <img src={previewSrc} alt={name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-[var(--v2-surface)] text-[var(--v2-text-tertiary)]">
              <MimeIcon mimeType={mimeType} size={20} />
            </span>
          )}
        </button>
      ) : (
        <div
          className={cn(
            "relative h-14 w-14 overflow-hidden rounded-[var(--v2-radius-base)] border bg-[var(--v2-raised)]",
            status === "error" ? "border-[var(--v2-status-danger)]" : "border-[var(--v2-border-default)]",
          )}
          title={label}
        >
          {isImage && previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- deterministic data-URI preview, no optimization needed
            <img src={previewSrc} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--v2-surface)] text-[var(--v2-text-tertiary)]">
              <MimeIcon mimeType={mimeType} size={20} />
            </div>
          )}
          {status === "loading" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[var(--v2-canvas)]" role="status" aria-label={progress !== undefined ? `Uploading ${progress}%` : "Uploading"}>
              <span className={styles.spinner} style={{ width: 18, height: 18, borderWidth: 2 }} aria-hidden />
            </div>
          ) : null}
          {status === "error" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--v2-status-danger)_12%,transparent)]" aria-hidden>
              <svg viewBox="0 0 16 16" width={18} height={18} fill="none" aria-hidden><circle cx="8" cy="8" r="6" stroke="var(--v2-status-danger)" strokeWidth="1.4" /><path d="M8 6v3M8 10.5h.01" stroke="var(--v2-status-danger)" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </div>
          ) : null}
          {status === "loading" && progress !== undefined ? (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-[var(--v2-border-subtle)]">
              <div className="h-full bg-[var(--v2-text-primary)] transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(100, progress))}%`, transitionTimingFunction: "var(--v2-ease-default)" }} />
            </div>
          ) : null}
        </div>
      )}
      {context === "composer" && status !== "loading" && onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-[var(--v2-border-default)] bg-[var(--v2-raised)] text-[var(--v2-text-primary)] shadow-[var(--v2-shadow-small)] hover:bg-[var(--v2-hover)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]"
        >
          <svg viewBox="0 0 16 16" width={10} height={10} fill="none" aria-hidden><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      ) : null}
      {/* Metadata tooltip-like caption for long names — visible on hover/focus via title, plus truncated label below tile for message context */}
    </div>
  );
}

/** Compact row variant for message/composer chips — handles long filenames via truncate. */
export function V2AttachmentRow({
  name,
  bytes,
  mimeType,
  status = "ready",
  progress,
  onRemove,
  onPreview,
  className,
}: Omit<V2AttachmentProps, "type" | "previewSrc" | "context"> & { className?: string; onPreview?: () => void }) {
  const meta = [bytes !== undefined ? formatFileSize(bytes) : null, mimeType].filter(Boolean).join(" · ");
  const previewLabel = `${name}${meta ? ` · ${meta}` : ""}`;
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-[var(--v2-radius-base)] border bg-[var(--v2-raised)] px-2 py-1.5 text-[12px] transition-colors",
        status === "error" ? "border-[var(--v2-status-danger)] text-[var(--v2-status-danger)]" : "border-[var(--v2-border-default)] text-[var(--v2-text-secondary)]",
        className
      )}
      title={previewLabel}
    >
      {onPreview ? (
        <button
          type="button"
          onClick={onPreview}
          aria-label={`Preview ${previewLabel}`}
          className="inline-flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]"
        >
          <span className="text-[var(--v2-text-tertiary)]"><MimeIcon mimeType={mimeType} size={14} /></span>
          <span className="min-w-0 flex-1 truncate font-medium text-[var(--v2-text-primary)]">{name}</span>
          {meta ? <span className="shrink-0 text-[12px] text-[var(--v2-text-tertiary)]">{meta}</span> : null}
        </button>
      ) : (
        <>
          <span className="text-[var(--v2-text-tertiary)]"><MimeIcon mimeType={mimeType} size={14} /></span>
          <span className="min-w-0 flex-1 truncate font-medium text-[var(--v2-text-primary)]">{name}</span>
          {meta ? <span className="shrink-0 text-[12px] text-[var(--v2-text-tertiary)]">{meta}</span> : null}
        </>
      )}
      {status === "loading" ? <span className={cn(styles.spinner)} style={{ width: 12, height: 12, borderWidth: 1.5 }} role="status" aria-label="Uploading" /> : null}
      {status === "loading" && progress !== undefined ? <span className="text-[12px] text-[var(--v2-text-tertiary)]">{progress}%</span> : null}
      {status === "error" ? <span className="text-[12px] font-medium text-[var(--v2-status-danger)]">Failed</span> : null}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="grid h-6 w-6 place-items-center rounded-[4px] text-[var(--v2-text-tertiary)] hover:bg-[var(--v2-hover)] hover:text-[var(--v2-text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--v2-focus-ring)]"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
