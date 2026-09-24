"use client";

import * as React from "react";
import { cn } from "../../../lib/utils";
import styles from "../v2.module.css";
import { V2Breadcrumbs, type V2BreadcrumbItem } from "../navigation/Breadcrumbs";
import { V2Badge } from "../Badge";
import { V2Tabs, type V2TabItem } from "../Tabs";

export interface DetailShellProps {
  breadcrumb?: V2BreadcrumbItem[];
  title: React.ReactNode;
  status?: { label: string; tone?: "neutral" | "info" | "success" | "warning" | "danger" };
  actions?: React.ReactNode;
  metadata?: Array<{ label: string; value: React.ReactNode }>;
  tabs?: V2TabItem[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children: React.ReactNode;
  inspector?: React.ReactNode;
  inspectorWidth?: 320 | 404;
  audit?: React.ReactNode;
  activity?: React.ReactNode;
  className?: string;
}

/**
 * DetailShell V2 — universal detail for Run / Project / Model / Provider / Finding / Workflow / Instance.
 * Composition: breadcrumb/context → title + status + actions → metadata (row+divider) → tabs/subnav → main detail → optional inspector (320/404) → audit/activity.
 * No giant cards. Uses rows/dividers, 6px, Geist Sans/Mono, pilot light hierarchy #E5E5E5/#DCDCDC/#D2D2D2.
 */
export function DetailShell({
  breadcrumb,
  title,
  status,
  actions,
  metadata,
  tabs,
  activeTab,
  onTabChange,
  children,
  inspector,
  inspectorWidth = 320,
  audit,
  activity,
  className,
}: DetailShellProps) {
  return (
    <div className={cn(styles.detailShell, className)} data-inspector={inspector ? inspectorWidth : undefined}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <div className={styles.detailBreadcrumb}>
          <V2Breadcrumbs items={breadcrumb} />
        </div>
      ) : null}

      <header className={styles.detailHeader} data-v2-pattern="detail-header">
        <div className={styles.detailTitleRow}>
          <h1 className={styles.detailTitle}>{title}</h1>
          {status ? <V2Badge tone={status.tone ?? "neutral"} size="sm">{status.label}</V2Badge> : null}
        </div>
        {actions ? <div className={styles.detailActions}>{actions}</div> : null}
      </header>

      {metadata && metadata.length > 0 ? (
        <dl className={styles.detailMeta}>
          {metadata.map((m) => (
            <div key={m.label} className={styles.detailMetaRow}>
              <dt className={styles.detailMetaLabel}>{m.label}</dt>
              <dd className={styles.detailMetaValue}>{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {tabs && tabs.length > 0 && activeTab && onTabChange ? (
        <div className={styles.detailTabs} data-v2-pattern="family-navigation">
          <V2Tabs items={tabs} value={activeTab} onValueChange={onTabChange} />
        </div>
      ) : null}

      <div className={styles.detailBody} data-inspector-width={inspectorWidth}>
        <div className={styles.detailMain}>{children}</div>
        {inspector ? (
          <aside className={styles.detailInspector} aria-label="Inspector" style={{ width: inspectorWidth } as React.CSSProperties}>
            {inspector}
          </aside>
        ) : null}
      </div>

      {(audit || activity) && (
        <div className={styles.detailFoot}>
          {audit ? <section className={styles.detailAudit} aria-label="Audit">{audit}</section> : null}
          {activity ? <section className={styles.detailActivity} aria-label="Activity">{activity}</section> : null}
        </div>
      )}
    </div>
  );
}

// ── Inspector context-rail slot components ───────────────────────────────
export function DetailInspectorSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(styles.detailInspectorSection, className)}>
      <h3 className={styles.detailInspectorTitle}>{title}</h3>
      <div className={styles.detailInspectorContent}>{children}</div>
    </section>
  );
}

export function DetailAuditRow({ time, actor, event, detail, className }: { time?: string; actor: string; event: string; detail?: string; className?: string }) {
  return (
    <div className={cn(styles.detailAuditRow, className)}>
      <span className={styles.detailAuditDot} aria-hidden />
      <div className={styles.detailAuditBody}>
        <p className={styles.detailAuditEvent}><span className={styles.detailAuditActor}>{actor}</span> {event}</p>
        {detail ? <p className={styles.detailAuditDetail}>{detail}</p> : null}
      </div>
      {time ? <time className={styles.detailAuditTime}>{time}</time> : null}
    </div>
  );
}
