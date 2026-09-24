/**
 * Shared Ethen settings shell — one modal/sheet geometry, nav, search
 * interaction and settings primitives for Chat + Designer.
 *
 * Usage: wrap a settings page (or dialog) in <SettingsShell>, render one
 * <SettingsSection> per visible section, and use the shared primitives for
 * every row/control so both products stay visually and behaviorally unified.
 */
"use client";

import * as React from "react";
import type { SettingsGroup, SettingsSearchEntry } from "./settings-sections";
import { CUSTOMIZE_GROUP_LABEL } from "./settings-sections";
import styles from "./settings-shell.module.css";

// ── Shell ────────────────────────────────────────────────────────────────────

export interface ShellSection {
  id: string;
  label: string;
  group: SettingsGroup;
}

export interface SettingsShellProps {
  /** Product name for the accessible title, e.g. "Chat settings". */
  title: string;
  product: "chat" | "designer" | "studio";
  sections: readonly ShellSection[];
  active: string;
  onActive: (id: string) => void;
  query: string;
  onQuery: (query: string) => void;
  searchResults: readonly SettingsSearchEntry[];
  onSearchSelect: (entry: SettingsSearchEntry) => void;
  /** Render as a modal dialog (overlay) or inline (full page route). */
  asDialog?: boolean;
  onClose?: () => void;
  /** When true, closing / switching asks for discard confirmation. */
  hasUnsaved?: boolean;
  /** Status line under the title (save state / persistence note). */
  status?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
  /**
   * Remediation Pass 1: route template stamped as `data-iex-route` on the
   * visible title. Inline page routes pass their template; dialogs omit.
   */
  titleRouteMarker?: string;
}

function groupLabel(group: SettingsGroup): string | null {
  if (group === "customize") return CUSTOMIZE_GROUP_LABEL;
  if (group === "chat") return "Chat";
  if (group === "designer") return "Designer";
  if (group === "studio") return "Studio";
  return null;
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Centered desktop dialog / full-height mobile sheet. Focus-trapped while
 * modal, Escape closes, focus returns to the launcher on unmount.
 */
export function SettingsShell({
  title,
  product,
  sections,
  active,
  onActive,
  query,
  onQuery,
  searchResults,
  onSearchSelect,
  asDialog = false,
  onClose,
  hasUnsaved = false,
  status,
  backHref,
  backLabel,
  children,
  titleRouteMarker,
}: SettingsShellProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const launcherRef = React.useRef<Element | null>(null);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const titleId = React.useId();
  const queryTrimmed = query.trim();
  const showResults = searchOpen && queryTrimmed.length > 0;

  React.useEffect(() => {
    launcherRef.current = document.activeElement;
    if (asDialog) {
      const node = dialogRef.current;
      node?.focus();
      const previouslyFocused = document.activeElement as HTMLElement | null;
      void previouslyFocused;
    } else {
      searchRef.current?.focus?.();
    }
    return () => {
      const launcher = launcherRef.current as HTMLElement | null;
      launcher?.focus?.();
    };
  }, [asDialog]);

  // Escape closes (with unsaved-change protection).
  React.useEffect(() => {
    if (!asDialog || !onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (hasUnsaved) setConfirmDiscard(true);
      else onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [asDialog, onClose, hasUnsaved]);

  // Minimal focus trap while modal.
  const onTrapKey = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (!asDialog || event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = focusableIn(root);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [asDialog],
  );

  const requestClose = React.useCallback(() => {
    if (hasUnsaved) {
      setConfirmDiscard(true);
      return;
    }
    onClose?.();
  }, [hasUnsaved, onClose]);

  const selectSection = React.useCallback(
    (id: string) => {
      if (hasUnsaved) {
        setConfirmDiscard(true);
        return;
      }
      onActive(id);
    },
    [hasUnsaved, onActive],
  );

  const onNavKey = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-nav-item]"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? buttons[(index + 1) % buttons.length] : buttons[(index - 1 + buttons.length) % buttons.length];
    next?.focus();
  }, []);

  const visibleSections = React.useMemo(() => {
    if (!queryTrimmed) return sections;
    const ids = new Set(searchResults.map((r) => r.sectionId));
    return sections.filter((s) => ids.has(s.id));
  }, [sections, searchResults, queryTrimmed]);

  const nav = (
    <nav aria-label={`${title} sections`} className={styles.nav} onKeyDown={onNavKey}>
      {visibleSections.map((section, index) => {
        const header = index === 0 || visibleSections[index - 1]!.group !== section.group ? groupLabel(section.group) : null;
        return (
          <React.Fragment key={section.id}>
            {header ? (
              <p className={styles.navGroup} aria-hidden="true">
                {header}
              </p>
            ) : null}
            <button
              type="button"
              data-nav-item
              aria-current={active === section.id ? "true" : undefined}
              data-active={active === section.id || undefined}
              className={styles.navButton}
              onClick={() => selectSection(section.id)}
            >
              {section.label}
            </button>
          </React.Fragment>
        );
      })}
      {visibleSections.length === 0 ? (
        <p className={styles.navEmpty} role="status">
          No settings match “{queryTrimmed}”.
        </p>
      ) : null}
    </nav>
  );

  const searchBox = (
    <div className={styles.searchWrap}>
      <label className={styles.searchLabel} htmlFor={`${titleId}-search`}>
        Search settings
      </label>
      <input
        ref={searchRef}
        id={`${titleId}-search`}
        type="search"
        autoComplete="off"
        placeholder="Search settings"
        value={query}
        onChange={(event) => {
          onQuery(event.target.value);
          setSearchOpen(true);
        }}
        onFocus={() => setSearchOpen(true)}
        onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && searchResults.length > 0) {
            onSearchSelect(searchResults[0]);
            setSearchOpen(false);
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            onQuery("");
            setSearchOpen(false);
          }
        }}
        className={styles.search}
        role="combobox"
        aria-expanded={showResults}
        aria-controls={`${titleId}-results`}
        aria-autocomplete="list"
      />
      {showResults ? (
        <ul id={`${titleId}-results`} role="listbox" aria-label="Settings results" className={styles.results}>
          {searchResults.map((entry) => (
            <li key={`${entry.sectionId}-${entry.label}`} role="option" aria-selected="false">
              <button
                type="button"
                className={styles.resultButton}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSearchSelect(entry);
                  setSearchOpen(false);
                }}
              >
                <span>{entry.label}</span>
                <small>{entry.keywords.slice(0, 3).join(" · ")}</small>
              </button>
            </li>
          ))}
          {searchResults.length === 0 ? (
            <li className={styles.resultEmpty} role="option" aria-selected="false">
              No settings match “{queryTrimmed}”.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );

  const body = (
    <>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {backHref ? (
            <a href={backHref} className={styles.backLink}>
              {backLabel ?? "Back"}
            </a>
          ) : null}
          {/* Route-focus destination (same pattern as the Chat greeting):
              EthenRouteFocus focuses h1[data-iex-route] and stamps
              tabindex="-1"; declaring it keeps server and client identical
              so hydration stays clean. */}
          <h1 id={titleId} className={styles.title} data-iex-route={titleRouteMarker ?? undefined} tabIndex={-1}>
            {title}
          </h1>
          {asDialog && onClose ? (
            <button type="button" onClick={requestClose} aria-label="Close settings" className={styles.close}>
              ×
            </button>
          ) : null}
        </div>
        {searchBox}
        {status ? <div className={styles.statusLine}>{status}</div> : null}
        {confirmDiscard ? (
          <p role="alert" className={styles.discard}>
            You have unsaved changes.{" "}
            <button type="button" className={styles.linkButton} onClick={() => { setConfirmDiscard(false); onClose?.(); }}>
              Discard them
            </button>{" "}
            or{" "}
            <button type="button" className={styles.linkButton} onClick={() => setConfirmDiscard(false)}>
              keep editing
            </button>
            .
          </p>
        ) : null}
      </div>
      <div className={styles.columns} data-product={product}>
        {nav}
        <div className={styles.content} aria-live="off">
          {children}
        </div>
      </div>
    </>
  );

  if (!asDialog) {
    return (
      <div className={styles.page} data-eds-theme-consumer>
        {body}
      </div>
    );
  }

  return (
    <div
      className={styles.overlay}
      data-settings-product={product}
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.dialog}
        onKeyDown={onTrapKey}
      >
        {body}
      </div>
    </div>
  );
}

// ── Primitives ───────────────────────────────────────────────────────────────

export function SettingsSection({
  id,
  title,
  meta,
  children,
}: {
  id: string;
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} id={`settings-section-${id}`} data-settings-section={id} className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {meta ? <p className={styles.sectionMeta}>{meta}</p> : null}
      {children}
    </section>
  );
}

export function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.group}>
      <h3 className={styles.groupTitle}>{label}</h3>
      {children}
    </div>
  );
}

export function SettingsRow({
  id,
  title,
  detail,
  action,
  highlight,
}: {
  id?: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div id={id} data-highlight={highlight || undefined} className={styles.row}>
      <span className={styles.rowText}>
        <strong className={styles.rowTitle}>{title}</strong>
        {detail ? <small className={styles.rowDetail}>{detail}</small> : null}
      </span>
      {action ? <span className={styles.rowAction}>{action}</span> : null}
    </div>
  );
}

export function SettingsToggle({
  label,
  checked,
  onChange,
  disabled,
  disabledReason,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      title={disabled ? (disabledReason ?? "Unavailable") : undefined}
      aria-disabled={disabled || undefined}
      data-on={checked || undefined}
      className={styles.toggle}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" className={styles.toggleKnob} />
    </button>
  );
}

export function SettingsSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
  disabledReason,
  detail,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: readonly { value: string; label: string; disabled?: boolean; disabledReason?: string }[];
  disabled?: boolean;
  disabledReason?: string;
  detail?: string;
}) {
  return (
    <span className={styles.fieldWrap}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {detail ? <small className={styles.rowDetail}>{detail}</small> : null}
      <select
        id={id}
        value={value}
        disabled={disabled}
        title={disabled ? (disabledReason ?? "Unavailable") : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={styles.select}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            title={option.disabled ? (option.disabledReason ?? "Unavailable") : undefined}
          >
            {option.label}
            {option.disabled && option.disabledReason ? ` — ${option.disabledReason}` : ""}
          </option>
        ))}
      </select>
    </span>
  );
}

export function SettingsTextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  detail,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  detail?: string;
  type?: string;
}) {
  return (
    <span className={styles.fieldWrap}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {detail ? <small className={styles.rowDetail}>{detail}</small> : null}
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={styles.input}
      />
    </span>
  );
}

export function SettingsTextarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  detail,
  rows = 4,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  detail?: string;
  rows?: number;
}) {
  return (
    <span className={styles.fieldWrap}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {detail ? <small className={styles.rowDetail}>{detail}</small> : null}
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className={styles.textarea}
      />
    </span>
  );
}

export function SettingsButton({
  children,
  onClick,
  disabled,
  disabledReason,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? (disabledReason ?? "Unavailable") : undefined}
      aria-disabled={disabled || undefined}
      data-variant={variant}
      className={styles.button}
    >
      {children}
    </button>
  );
}

/**
 * Dangerous action with explicit inline confirmation. The confirm callback
 * performs the real server action and returns an error message (or null).
 */
export function SettingsDangerAction({
  title,
  detail,
  actionLabel,
  confirmLabel,
  onConfirm,
  disabled,
  disabledReason,
}: {
  title: string;
  detail?: string;
  actionLabel: string;
  confirmLabel: string;
  onConfirm: () => Promise<string | null>;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  return (
    <div className={styles.danger}>
      <SettingsRow
        title={title}
        detail={detail}
        action={
          disabled ? (
            <SettingsButton disabled disabledReason={disabledReason}>
              {actionLabel}
            </SettingsButton>
          ) : confirming ? (
            <span className={styles.dangerConfirm}>
              <SettingsButton
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void onConfirm().then((problem) => {
                    setBusy(false);
                    if (problem) {
                      setError(problem);
                      return;
                    }
                    setConfirming(false);
                    setDone("Done.");
                  });
                }}
              >
                {busy ? "Working…" : confirmLabel}
              </SettingsButton>
              <SettingsButton onClick={() => { setConfirming(false); setError(null); }}>
                Cancel
              </SettingsButton>
            </span>
          ) : (
            <SettingsButton onClick={() => { setConfirming(true); setDone(null); }}>
              {actionLabel}
            </SettingsButton>
          )
        }
      />
      {error ? (
        <p role="alert" className={styles.inlineError}>
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className={styles.inlineOk}>
          {done}
        </p>
      ) : null}
    </div>
  );
}

export function SettingsSaveState({
  phase,
  error,
  persistence,
  onRetry,
}: {
  phase: "loading" | "ready" | "saving" | "error";
  error: string | null;
  persistence: "server" | "local";
  onRetry?: () => void;
}) {
  if (phase === "loading") return <p role="status" className={styles.saveState}>Loading settings…</p>;
  if (phase === "saving") return <p role="status" className={styles.saveState}>Saving…</p>;
  if (phase === "error" && error) {
    return (
      <p role="alert" className={styles.inlineError}>
        {error}{" "}
        {onRetry ? (
          <button type="button" className={styles.linkButton} onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <p role="status" className={styles.saveState}>
      {persistence === "server" ? "Synced across Chat and Designer." : "Stored in this browser only — sign in to sync."}
    </p>
  );
}

export function SettingsTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: readonly string[];
  rows: readonly (readonly React.ReactNode[])[];
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.tableCaption}>{caption}</caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}>
              {row.map((cell, j) => (
                // eslint-disable-next-line react/no-array-index-key
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsEmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <p role="status">{message}</p>
      {action}
    </div>
  );
}

export function SettingsErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={styles.empty}>
      <p role="alert">{message}</p>
      <SettingsButton onClick={onRetry}>Retry</SettingsButton>
    </div>
  );
}
