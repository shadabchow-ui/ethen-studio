"use client";

/**
 * CHAT_A1 — the Chat rail. 272px, four primary items, nothing else.
 *
 * The architectural rule this component exists to hold: the flagship products
 * (Code, Studio, Voice, Flow, Designer, Founder, Sentinel, Gateway, Compute,
 * Model Intelligence, Local Models) NEVER appear here. They belong to
 * platform.upcube.ai, and the only bridge is one restrained escape hatch near
 * the bottom. A Chat rail that becomes a product directory has stopped being
 * a chat surface, which is the failure mode the whole spec is written against.
 *
 * The rail is also the surface that RECEDES: `--chat-sidebar` sits one tone
 * below `--chat-canvas`, so the conversation is the only lit thing on screen.
 */
import * as React from "react";
import { Icon } from "../icons";
import { ChatIcon } from "./chat-icons";
import { ChatMenu } from "./chat-menu";
import {
  ACCOUNT,
  CHAT_PROJECTS,
  type ChatHistoryGroup,
} from "./chat-fixtures";
import styles from "./chat-sidebar.module.css";

/**
 * Ethen Platform is a separate deployment target on its own origin, so this is
 * a real cross-origin link, not an in-app route. A relative "/platform" href
 * resolved to the marketing overview, which the Chat target denies 404 — and
 * next/link prefetched it on render, producing a console error on every load.
 * Override the origin for local or preview runs; production uses the canonical
 * Platform host.
 */
const PLATFORM_ORIGIN =
  process.env.NEXT_PUBLIC_PLATFORM_ORIGIN || "https://platform.upcube.ai";


export type ChatSidebarProps = Readonly<{
  history: readonly ChatHistoryGroup[];
  activeChatId?: string | null;
  activeProjectId?: string | null;
  /** CHAT-03 shows the pinned-projects empty state instead of the list. */
  projectsEmpty?: boolean;
  variant?: "rail" | "drawer";
  onNewChat?: () => void;
  onSearch?: () => void;
  onClose?: () => void;
  /** CHAT_A2_1 minimal local activation — no persistence, no backend sync. */
  onSelectChat?: (chatId: string) => void;
}>;

function NavRow({
  icon,
  label,
  shortcut,
  onClick,
  active,
  disabled,
  disabledReason,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  active?: boolean;
  /** CHAT_A5.1 — lab-unavailable entries stay visible but honestly disabled. */
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      className={styles.navRow}
      data-active={active ? "true" : undefined}
      onClick={onClick}
      disabled={disabled}
      title={disabledReason}
    >
      <span className={styles.navIcon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.navLabel}>{label}</span>
      {shortcut ? <kbd className={styles.shortcut}>{shortcut}</kbd> : null}
    </button>
  );
}

export function ChatSidebar({
  history,
  activeChatId = null,
  activeProjectId = null,
  projectsEmpty = false,
  variant = "rail",
  onNewChat,
  onSearch,
  onClose,
  onSelectChat,
}: ChatSidebarProps) {
  return (
    <nav className={styles.rail} data-variant={variant} aria-label="Ethen Chat">
      <div className={styles.brandRow}>
        <div className={styles.brand}>
          <p className={styles.wordmark}>Ethen</p>
          <p className={styles.product}>Chat</p>
        </div>
        {variant === "drawer" ? (
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close navigation">
            <ChatIcon name="remove" size={18} />
          </button>
        ) : null}
      </div>

      <div className={styles.primary}>
        <button type="button" className={styles.newChat} onClick={onNewChat}>
          <Icon name="plus" size={16} />
          <span>New</span>
          <kbd className={styles.shortcut}>⌘N</kbd>
        </button>
        <NavRow icon={<Icon name="search" size={16} />} label="Search" shortcut="⌘K" onClick={onSearch} />
        <NavRow
          icon={<Icon name="folder" size={16} />}
          label="Projects"
          disabled
          disabledReason="Projects are not wired in this lab preview"
        />
        <NavRow
          icon={<Icon name="files" size={16} />}
          label="Artifacts"
          disabled
          disabledReason="Artifacts are not wired in this lab preview"
        />
      </div>

      <div className={styles.scroll}>
        <section className={styles.section} aria-labelledby="chat-rail-projects">
          <header className={styles.sectionHeader}>
            <h2 id="chat-rail-projects">Projects</h2>
            <button
              type="button"
              className={styles.sectionAction}
              aria-label="New project"
              disabled
              title="Projects are not wired in this lab preview"
            >
              <Icon name="plus" size={16} />
            </button>
          </header>
          {projectsEmpty ? (
            <p className={styles.emptyHint}>
              <ChatIcon name="pin" size={14} />
              <span>Pin projects to keep them here</span>
            </p>
          ) : (
            <ul className={styles.rows}>
              {CHAT_PROJECTS.map((project) => (
                <li key={project.id}>
                  <div className={styles.row} data-active={project.id === activeProjectId ? "true" : undefined}>
                    <button
                      type="button"
                      className={styles.rowButton}
                      disabled
                      title="Projects are not wired in this lab preview"
                    >
                      <span className={styles.rowTitle}>{project.name}</span>
                    </button>
                    <span className={styles.rowMeta} aria-hidden="true">
                      {project.chats}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {history.map((group) => (
          <section className={styles.section} key={group.label} aria-labelledby={`chat-rail-${group.label}`}>
            <header className={styles.sectionHeader}>
              <h2 id={`chat-rail-${group.label}`}>{group.label}</h2>
            </header>
            <ul className={styles.rows}>
              {group.items.map((item) => (
                <li key={item.id}>
                  <div className={styles.row} data-active={item.id === activeChatId ? "true" : undefined}>
                    <button type="button" className={styles.rowButton} onClick={() => onSelectChat?.(item.id)}>
                      <span className={styles.rowTitle}>{item.title}</span>
                    </button>
                    <ChatMenu
                      label={`Actions for ${item.title}`}
                      placement="bottom"
                      align="end"
                      triggerClassName={styles.rowMenu}
                      menuClassName={styles.rowMenuPopup}
                      trigger={<ChatIcon name="more" size={16} />}
                      footer="Lab preview — row actions are not wired."
                      groups={[
                        {
                          items: [
                            { id: "rename", label: "Rename", disabled: true },
                            { id: "project", label: "Move to project", disabled: true },
                            { id: "share", label: "Share", disabled: true },
                          ],
                        },
                        { items: [{ id: "delete", label: "Delete", tone: "danger", disabled: true }] },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className={styles.foot}>
        <a
          className={styles.platformLink}
          href={PLATFORM_ORIGIN}
          target="_blank"
          rel="noreferrer noopener"
        >
          <span>Ethen Platform</span>
          <ChatIcon name="external" size={14} />
        </a>

        <ChatMenu
          label={`Account: ${ACCOUNT.name}`}
          placement="top"
          align="start"
          triggerClassName={styles.account}
          menuClassName={styles.accountMenu}
          trigger={
            <>
              <span className={styles.avatar} aria-hidden="true">
                {ACCOUNT.initial}
              </span>
              <span className={styles.accountText}>
                <span className={styles.accountName}>{ACCOUNT.name}</span>
                <span className={styles.accountPlan}>{ACCOUNT.plan}</span>
              </span>
              <Icon name="chevron-down" size={16} />
            </>
          }
          footer="Lab preview — the account row is a fixture."
          groups={[
            {
              items: [
                { id: "settings", label: "Settings", disabled: true },
                { id: "appearance", label: "Appearance", disabled: true },
                { id: "shortcuts", label: "Keyboard shortcuts", disabled: true },
              ],
            },
            {
              items: [
                { id: "billing", label: "Billing", disabled: true },
                { id: "help", label: "Help", disabled: true },
                { id: "platform", label: "Open Ethen Platform", disabled: true },
              ],
            },
            { items: [{ id: "signout", label: "Sign out", disabled: true }] },
          ]}
        />
      </div>
    </nav>
  );
}
