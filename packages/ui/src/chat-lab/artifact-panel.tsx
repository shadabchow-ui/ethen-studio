"use client";

/**
 * CHAT_A1 — the artifact side panel.
 *
 * Contextual, never permanent. On desktop it takes 44% of the workspace and
 * the chat KEEPS its composer and its thread; on mobile it becomes a full
 * temporary view with an explicit return. There is no three-column IDE mode,
 * because the moment the artifact panel stops being dismissible the product
 * stops being a chat surface.
 */
import * as React from "react";
import { ChatIcon } from "./chat-icons";
import { DEFAULT_CHAT_ARTIFACT } from "@ethen/ai/chat/artifact-presentation";
import { copyTextToClipboard } from "./chat-interaction";
import styles from "./artifact-panel.module.css";

type ArtifactView = "preview" | "source";

/** A deliberately small Markdown preview — headings, tables, paragraphs. */
function Preview({ body }: { body: string }) {
  const lines = body.split("\n");
  const nodes: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("# ")) {
      nodes.push(<h2 key={index}>{line.slice(2)}</h2>);
      index += 1;
    } else if (line.startsWith("## ")) {
      nodes.push(<h3 key={index}>{line.slice(3)}</h3>);
      index += 1;
    } else if (line.startsWith("| ")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].startsWith("| ")) {
        const cells = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
        if (!cells.every((cell) => /^-+$/.test(cell))) rows.push(cells);
        index += 1;
      }
      const [head, ...body_] = rows;
      nodes.push(
        <div className={styles.tableWrap} key={`table-${index}`}>
          <table>
            <thead>
              <tr>{head.map((cell) => <th key={cell} scope="col">{cell}</th>)}</tr>
            </thead>
            <tbody>
              {body_.map((row) => (
                <tr key={row.join("|")}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s/, ""));
        index += 1;
      }
      nodes.push(<ol key={`ol-${index}`}>{items.map((item) => <li key={item}>{item}</li>)}</ol>);
    } else if (line.trim() === "") {
      index += 1;
    } else {
      const paragraph: string[] = [];
      while (index < lines.length && lines[index].trim() !== "" && !lines[index].startsWith("#") && !lines[index].startsWith("|") && !/^\d+\.\s/.test(lines[index])) {
        paragraph.push(lines[index]);
        index += 1;
      }
      nodes.push(<p key={`p-${index}`}>{paragraph.join(" ")}</p>);
    }
  }

  return <div className={styles.preview}>{nodes}</div>;
}

export function ArtifactPanel({
  title = DEFAULT_CHAT_ARTIFACT.title,
  body = DEFAULT_CHAT_ARTIFACT.body,
  onClose,
  autoFocus = false,
  status = "ready",
  error,
  onRetry,
}: {
  title?: string;
  body?: string;
  onClose?: () => void;
  /** CHAT_A3 — the shell passes this when the panel opens as a view, so focus lands inside it. */
  autoFocus?: boolean;
  /** CHAT_A3 — local loading/error states; the conversation behind is untouched. */
  status?: "ready" | "loading" | "error";
  error?: Readonly<{ title: string; detail: string; action: string }>;
  onRetry?: () => void;
}) {
  const [view, setView] = React.useState<ArtifactView>("preview");
  const [copied, setCopied] = React.useState(false);
  const panelRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (autoFocus) panelRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const copy = React.useCallback(() => {
    void copyTextToClipboard(body).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [body]);

  return (
    <section ref={panelRef} className={styles.panel} aria-label={`Artifact: ${title}`} tabIndex={-1}>
      <header className={styles.header}>
        {/* Return-to-chat is the mobile affordance and Close is the desktop
          * one; both are always in the DOM so neither is a hover-only or
          * breakpoint-only escape from a full-screen view. */}
        <button type="button" className={styles.back} onClick={onClose} aria-label="Back to chat">
          <ChatIcon name="back" size={16} />
          <span aria-hidden="true">Chat</span>
        </button>
        <div className={styles.titleBlock}>
          <p className={styles.title}>{title}</p>
          <p className={styles.meta}>Document · edited just now</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle} role="group" aria-label="Artifact view">
            <button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}>
              Preview
            </button>
            <button type="button" aria-pressed={view === "source"} onClick={() => setView("source")}>
              Source
            </button>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={copied ? "Copied" : "Copy artifact"}
            aria-live="polite"
            onClick={copy}
          >
            <ChatIcon name="copy" size={16} />
          </button>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close artifact">
            <ChatIcon name="remove" size={16} />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {status === "loading" ? (
          <p className={styles.status} role="status">Loading artifact…</p>
        ) : status === "error" ? (
          <div className={styles.status} role="alert">
            <p><strong>{error?.title ?? "Artifact did not load"}</strong></p>
            <p>{error?.detail ?? "The preview failed locally. The conversation is unchanged."}</p>
            <button type="button" className={styles.retry} onClick={onRetry}>
              {error?.action ?? "Try again"}
            </button>
          </div>
        ) : view === "preview" ? (
          <Preview body={body} />
        ) : (
          <pre className={styles.source}>
            <code>{body}</code>
          </pre>
        )}
      </div>
    </section>
  );
}
