"use client";

/**
 * CHAT_A1 — the conversation surface.
 *
 * The asymmetry is the design: a user turn is a small contained surface, an
 * Ethen turn is open canvas with no bubble at all. That is what lets a long
 * research answer stay readable for twenty minutes, and it is the single
 * biggest reason the thread does not read like a messaging app.
 *
 * Tool activity shows EXECUTION STATE only — "Searched the web · 8 sources".
 * Private reasoning is never rendered, and there is nowhere in this component
 * that could render it.
 */
import * as React from "react";
import { ChatIcon } from "./chat-icons";
import { ChatMenu } from "./chat-menu";
import { copyTextToClipboard } from "./chat-interaction";
import type { ChatSource, ChatTurn, ProseBlock, ToolStep } from "./chat-fixtures";
import styles from "./conversation-thread.module.css";

/** `inline code` inside fixture prose, without pulling in a Markdown parser. */
function Inline({ text }: { text: string }) {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <code key={`${part}-${index}`} className={styles.inlineCode}>
            {part}
          </code>
        ) : (
          <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

/**
 * CHAT_A2_2 — memoized: streamed chunks recreate the blocks array, but keys
 * stay stable so React updates text in place instead of remounting turns.
 */
/** Local clipboard copy with quiet confirmation — same pattern as the artifact panel. */
function useCopiedFlag(): [boolean, () => void] {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [
    copied,
    () => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    },
  ];
}

/** Truthful copy: the confirmation fires only after a successful write. */
function copyText(text: string, done: () => void): void {
  void copyTextToClipboard(text).then((ok) => {
    if (ok) done();
  });
}

function blockText(block: ProseBlock): string {
  switch (block.kind) {
    case "p":
    case "h":
    case "quote":
      return block.text;
    case "ul":
    case "ol":
      return block.items.join("\n");
    case "code":
      return block.code;
    case "table":
      return [...block.head, ...block.rows.flat()].join(" | ");
  }
}

const Block = React.memo(function Block({ block }: { block: ProseBlock }) {
  const [copied, markCopied] = useCopiedFlag();
  if (block.kind === "p") return <p><Inline text={block.text} /></p>;
  if (block.kind === "h") return <h3><Inline text={block.text} /></h3>;
  if (block.kind === "ul")
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}><Inline text={item} /></li>
        ))}
      </ul>
    );
  if (block.kind === "ol")
    return (
      <ol>
        {block.items.map((item) => (
          <li key={item}><Inline text={item} /></li>
        ))}
      </ol>
    );
  if (block.kind === "quote")
    return (
      <blockquote>
        <Inline text={block.text} />
      </blockquote>
    );
  if (block.kind === "code")
    return (
      <figure className={styles.codeBlock}>
        <figcaption>
          <span>{block.language}</span>
          <button
            type="button"
            className={styles.codeCopy}
            aria-label={copied ? "Copied" : "Copy code"}
            aria-live="polite"
            onClick={() => copyText(block.code, markCopied)}
          >
            <ChatIcon name="copy" size={13} />
            <span aria-hidden="true">{copied ? "Copied" : "Copy"}</span>
          </button>
        </figcaption>
        {/* Code scrolls inside its own box; the page never scrolls sideways. */}
        <pre>
          <code>{block.code}</code>
        </pre>
      </figure>
    );
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead>
          <tr>
            {block.head.map((cell) => (
              <th key={cell} scope="col">{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell) => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export function ToolActivity({ steps, label = "Activity" }: { steps: readonly ToolStep[]; label?: string }) {
  const running = steps.some((step) => step.state === "running");
  return (
    <ol
      className={styles.activity}
      aria-label={label}
      data-running={running ? "true" : undefined}
      data-complete={running ? undefined : "true"}
    >
      {steps.map((step) => (
        <li key={step.id} className={styles.activityStep} data-state={step.state}>
          <span className={styles.activityDot} aria-hidden="true" />
          <span className={styles.activityLabel}>{step.label}</span>
          {step.detail ? <span className={styles.activityDetail}>{step.detail}</span> : null}
          {step.state === "running" ? <span className={styles.visuallyHidden}>in progress</span> : null}
          {step.state === "failed" ? <span className={styles.visuallyHidden}>failed</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function SourceTray({ sources }: { sources: readonly ChatSource[] }) {
  const [open, setOpen] = React.useState(true);
  return (
    <section className={styles.sources} aria-labelledby="chat-sources">
      <button
        type="button"
        className={styles.sourcesHeader}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChatIcon name="sources" size={15} />
        <span id="chat-sources">Sources</span>
        <span className={styles.sourcesCount}>{sources.length}</span>
      </button>
      {open ? (
        <ol className={styles.sourceList}>
          {sources.map((source, index) => (
            <li key={source.id}>
              <button
                type="button"
                className={styles.sourceRow}
                disabled
                title="Source preview is not wired in this lab preview"
              >
                <span className={styles.sourceIndex} aria-hidden="true">{index + 1}</span>
                <span className={styles.sourceText}>
                  <span className={styles.sourceTitle}>{source.title}</span>
                  <span className={styles.sourceMeta}>
                    {source.origin} · {source.detail}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function MessageActions({
  blocks,
  onRetry,
  showRetry,
}: {
  blocks?: readonly ProseBlock[];
  onRetry?: () => void;
  /** CHAT_A5.1 — only the latest retryable attempt exposes Retry; older
   * attempts must not offer a control that would retry a different prompt. */
  showRetry?: boolean;
}) {
  const [copied, markCopied] = useCopiedFlag();
  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.action}
        aria-label={copied ? "Copied" : "Copy response"}
        aria-live="polite"
        onClick={() => {
          if (blocks) copyText(blocks.map(blockText).join("\n\n"), markCopied);
        }}
      >
        <ChatIcon name="copy" size={15} />
        <span aria-hidden="true">{copied ? "Copied" : "Copy"}</span>
      </button>
      {showRetry ? (
        <button type="button" className={styles.action} onClick={onRetry}>
          <ChatIcon name="retry" size={15} />
          <span>Retry</span>
        </button>
      ) : null}
      <button
        type="button"
        className={styles.actionIcon}
        aria-label="Good response"
        disabled
        title="Feedback is not wired in this lab preview"
      >
        <ChatIcon name="good" size={15} />
      </button>
      <button
        type="button"
        className={styles.actionIcon}
        aria-label="Bad response"
        disabled
        title="Feedback is not wired in this lab preview"
      >
        <ChatIcon name="bad" size={15} />
      </button>
      <ChatMenu
        label="More message actions"
        placement="bottom"
        align="start"
        triggerClassName={styles.actionMenu}
        trigger={<ChatIcon name="more" size={15} />}
        footer="Lab preview — message actions are not wired."
        groups={[
          {
            items: [
              { id: "branch", label: "Branch from here", disabled: true },
              { id: "save", label: "Save to project", disabled: true },
              { id: "artifact", label: "Create artifact", disabled: true },
              { id: "share", label: "Share", disabled: true },
            ],
          },
        ]}
      />
    </div>
  );
}

/**
 * CHAT_A2_2 — memoized turn rows. Streamed chunks replace only the active
 * assistant turn object, so every other turn bails out here and neither the
 * transcript nor the sidebar pays per-chunk render work. Callbacks stay
 * stable (turn id is passed at the call site, not closed over per render).
 */
const UserTurn = React.memo(function UserTurn({ turn }: { turn: ChatTurn }) {
  // CHAT_A5.1 — neutral: no owner name is hard-coded into reusable Chat UI.
  return (
    <article className={styles.userTurn} data-turn-id={turn.id} data-turn-role="user" aria-label="Message from you">
      <div className={styles.userBubble}>
        {turn.attachments && turn.attachments.length > 0 ? (
          <ul className={styles.userAttachments}>
            {turn.attachments.map((attachment) => (
              <li key={attachment.id}>
                <ChatIcon name={attachment.kind === "image" ? "image" : attachment.kind === "code" ? "code" : "document"} size={14} />
                <span>{attachment.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p>{turn.text}</p>
      </div>
    </article>
  );
});

const EthenTurn = React.memo(function EthenTurn({
  turn,
  artifactOpen,
  onOpenArtifact,
  onRetry,
  retryable,
}: {
  turn: ChatTurn;
  artifactOpen: boolean;
  onOpenArtifact?: () => void;
  onRetry?: (assistantTurnId: string) => void;
  /** True only for the latest assistant attempt — older ones hide Retry. */
  retryable: boolean;
}) {
  // Truthful concise state: the running tool step names itself; no reasoning shown.
  const runningStep = turn.steps?.find((step) => step.state === "running");
  return (
    <article className={styles.ethenTurn} data-turn-id={turn.id} data-turn-role="ethen" aria-label="Response from Ethen">
      {turn.steps && turn.steps.length > 0 ? <ToolActivity steps={turn.steps} /> : null}

      {turn.blocks ? (
        <div className={styles.prose} data-streaming={turn.streaming ? "true" : undefined}>
          {turn.blocks.map((block, index) => (
            <Block
              key={(block as ProseBlock & { key?: string }).key ?? `${block.kind}-${index}`}
              block={block}
            />
          ))}
        </div>
      ) : null}

      {turn.streaming ? (
        <p className={styles.streamingStatus} role="status">
          {runningStep ? `${runningStep.label}…` : "Ethen is responding…"}
        </p>
      ) : null}

      {turn.stopped ? (
        <p className={styles.streamingStatus} role="status">
          Stopped — partial response kept.
        </p>
      ) : null}

      {turn.artifact ? (
        <button
          type="button"
          className={styles.artifactCard}
          onClick={onOpenArtifact}
          aria-expanded={artifactOpen}
        >
          <span className={styles.artifactIcon} aria-hidden="true">
            <ChatIcon name="document" size={18} />
          </span>
          <span className={styles.artifactText}>
            <span className={styles.artifactTitle}>{turn.artifact}</span>
            <span className={styles.artifactMeta}>Document · click to open beside the chat</span>
          </span>
          <ChatIcon name="panel" size={16} />
        </button>
      ) : null}

      {turn.error ? (
        <div className={styles.turnError} role="status">
          <div>
            <strong>{turn.error.title}</strong>
            <span>{turn.error.detail}</span>
          </div>
          {retryable ? (
            <button type="button" onClick={onRetry ? () => onRetry(turn.id) : undefined}>{turn.error.action}</button>
          ) : null}
        </div>
      ) : null}

      {turn.sources && turn.sources.length > 0 ? <SourceTray sources={turn.sources} /> : null}

      {/* Reserved geometry while streaming: actions appear without moving text. */}
      {turn.streaming ? (
        <div className={styles.actionsPlaceholder} aria-hidden="true" />
      ) : (
        <MessageActions
          blocks={turn.blocks}
          onRetry={onRetry ? () => onRetry(turn.id) : undefined}
          showRetry={retryable}
        />
      )}
    </article>
  );
});

export function ConversationThread({
  turns,
  onOpenArtifact,
  onRetry,
  artifactOpen = false,
}: {
  turns: readonly ChatTurn[];
  onOpenArtifact?: () => void;
  onRetry?: (assistantTurnId: string) => void;
  artifactOpen?: boolean;
}) {
  // The latest assistant attempt alone may offer Retry: the controller's
  // retry() always replays the latest submission, so an older button would
  // silently retry a different prompt. No branching is built here.
  let lastEthenId: string | null = null;
  for (const turn of turns) {
    if (turn.role === "ethen") lastEthenId = turn.id;
  }
  return (
    <div className={styles.thread}>
      {turns.map((turn) =>
        turn.role === "user" ? (
          <UserTurn key={turn.id} turn={turn} />
        ) : (
          <EthenTurn
            key={turn.id}
            turn={turn}
            artifactOpen={artifactOpen}
            onOpenArtifact={onOpenArtifact}
            onRetry={onRetry}
            retryable={turn.id === lastEthenId}
          />
        ),
      )}
    </div>
  );
}
