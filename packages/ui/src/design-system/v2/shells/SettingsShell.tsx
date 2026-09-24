"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";
import { V2Badge } from "../Badge";

export interface SettingsNavItem {
  id: string;
  label: string;
  badge?: string;
  icon?: string;
}

export interface SettingsNavSection {
  heading: string;
  items: SettingsNavItem[];
}

export interface SettingsShellProps {
  nav: SettingsNavSection[];
  activeId: string;
  onNavigate?: (id: string) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export interface SettingRowProps {
  label: string;
  value?: string;
  supporting?: string;
  action?: string;
  actionLabel?: string;
  onAction?: () => void;
  danger?: boolean;
  monoValue?: boolean;
  last?: boolean;
}

export function SettingRow({ label, value, supporting, action, actionLabel, onAction, danger, monoValue, last }: SettingRowProps) {
  return (
    <div className={cn(styles.settingsRow, last && styles.settingsRowLast)}>
      <div className={styles.settingsRowMain}>
        <p className={styles.settingsRowLabel}>{label}</p>
        {supporting ? <p className={styles.settingsRowSupporting}>{supporting}</p> : null}
      </div>
      <div className={styles.settingsRowSide}>
        {value !== undefined ? <span className={cn(styles.settingsRowValue, monoValue && styles.settingsMonoValue)}>{value}</span> : null}
        {(action || actionLabel) && (
          <button type="button" onClick={onAction} className={cn(styles.settingsRowAction, danger && styles.settingsRowActionDanger)}>
            {actionLabel ?? action}
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingSection({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(styles.settingsSection, className)}>
      <header className={styles.settingsSectionHead}>
        <h2 className={styles.settingsSectionTitle}>{title}</h2>
        {description ? <p className={styles.settingsSectionDesc}>{description}</p> : null}
      </header>
      <div className={styles.settingsSectionBody}>{children}</div>
    </section>
  );
}

export function SettingDangerZone({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn(styles.settingsDangerZone, className)} aria-label="Danger zone">{children}</section>;
}

export function SettingHelpRow({ question, answer, defaultOpen = false, children }: { question: string; answer?: string; defaultOpen?: boolean; children?: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={styles.settingsHelpRow}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={styles.settingsHelpTrigger}>
        <span className={styles.settingsHelpQuestion}>{question}</span>
        <span className={styles.settingsHelpChevron} aria-hidden>{open ? "⌃" : "⌄"}</span>
      </button>
      {open ? <div className={styles.settingsHelpAnswer}>{children ?? (answer ? <p className={styles.settingsHelpText}>{answer}</p> : null)}</div> : null}
    </div>
  );
}

function MobileSheet({ open, onClose, nav, activeId, onNavigate }: { open: boolean; onClose: () => void; nav: SettingsNavSection[]; activeId: string; onNavigate?: (id: string) => void }) {
  if (!open) return null;
  return (
    <div className={styles.settingsMobileScrim} role="dialog" aria-modal="true" aria-label="Settings navigation">
      <div className={styles.settingsMobileSheet}>
        <div className={styles.settingsMobileHead}>
          <span className={styles.settingsMobileTitle}>Settings</span>
          <button type="button" aria-label="Close navigation" onClick={onClose} className={styles.settingsMobileClose}>✕</button>
        </div>
        <div className={styles.settingsMobileBody}>
          {nav.map((sec) => (
            <div key={sec.heading} className={styles.settingsNavSection}>
              <p className={styles.settingsNavHeading}>{sec.heading}</p>
              {sec.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={item.id === activeId ? "page" : undefined}
                  data-active={item.id === activeId ? "true" : undefined}
                  onClick={() => { onNavigate?.(item.id); onClose(); }}
                  className={styles.settingsNavRow}
                >
                  <span className={styles.settingsNavLabel}>{item.label}</span>
                  {item.badge ? <V2Badge tone="info" size="sm">{item.badge}</V2Badge> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * SettingsShell V2 — row-based sections, field/control alignment, danger zone, help/support, mobile sheet.
 * Navigation: 36px rows, selected via var(--v2-selected) + left accent, 6px radius, 24px page gutter.
 */
export function SettingsShell({ nav, activeId, onNavigate, title, description, children, className }: SettingsShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <div className={cn(styles.settingsShell, className)}>
      {/* Desktop nav */}
      <nav className={styles.settingsNav} aria-label="Settings navigation" data-v2-pattern="family-navigation">
        {nav.map((sec) => (
          <div key={sec.heading} className={styles.settingsNavSection}>
            <p className={styles.settingsNavHeading}>{sec.heading}</p>
            {sec.items.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === activeId ? "page" : undefined}
                data-active={item.id === activeId ? "true" : undefined}
                onClick={() => onNavigate?.(item.id)}
                className={styles.settingsNavRow}
              >
                <span className={styles.settingsNavLabel}>{item.label}</span>
                {item.badge ? <V2Badge tone="info" size="sm">{item.badge}</V2Badge> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Main */}
      <div className={styles.settingsMain}>
        <header className={styles.settingsHead} data-v2-pattern="page-header">
          <div className={styles.settingsHeadTitles}>
            <h1 className={styles.settingsTitle}>{title}</h1>
            {description ? <p className={styles.settingsDesc}>{description}</p> : null}
          </div>
          <button type="button" aria-label="Open settings navigation" className={styles.settingsMobileTrigger} onClick={() => setMobileOpen(true)}>
            Menu
          </button>
        </header>
        <div className={styles.settingsContent}>{children}</div>
      </div>

      <MobileSheet open={mobileOpen} onClose={() => setMobileOpen(false)} nav={nav} activeId={activeId} onNavigate={onNavigate} />
    </div>
  );
}
