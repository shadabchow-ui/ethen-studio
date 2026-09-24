"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "../../../lib/utils";
import { V2Badge, type V2BadgeTone } from "../Badge";
import { V2DataTable } from "../DataTable";
import { V2Tabs, type V2TabItem } from "../Tabs";
import { DetailShell } from "./DetailShell";
import type { V2BreadcrumbItem } from "../navigation/Breadcrumbs";
import type { V2TabItem as DetailTabItem } from "../Tabs";

/**
 * Specimen severity vocabulary from SentinelSpecimens.tsx.
 * critical → danger, high → warning, medium/low/info → neutral.
 */
export type SentinelSeverity = "critical" | "high" | "medium" | "low" | "info";

export const SENTINEL_SEVERITY_TONE: Record<SentinelSeverity, V2BadgeTone> = {
  critical: "danger",
  high: "warning",
  medium: "neutral",
  low: "neutral",
  info: "info",
};

export function sentinelSeverityTone(severity: string): V2BadgeTone {
  if (severity in SENTINEL_SEVERITY_TONE) {
    return SENTINEL_SEVERITY_TONE[severity as SentinelSeverity];
  }
  return "neutral";
}

export type SentinelNavId =
  | "overview"
  | "status"
  | "intake"
  | "repos"
  | "review"
  | "reports"
  | "history"
  | "settings";

export const SENTINEL_NAV: readonly { id: SentinelNavId; label: string; href: string }[] = [
  { id: "overview", label: "Overview", href: "/sentinel" },
  { id: "status", label: "Status", href: "/sentinel/status" },
  { id: "intake", label: "Intake", href: "/sentinel/intake" },
  { id: "repos", label: "Repos", href: "/sentinel/repos" },
  { id: "review", label: "Review", href: "/sentinel/review" },
  { id: "reports", label: "Reports", href: "/sentinel/reports" },
  { id: "history", label: "History", href: "/sentinel/history" },
  { id: "settings", label: "Settings", href: "/sentinel/settings" },
] as const;

const NAV_TABS: V2TabItem[] = SENTINEL_NAV.map((item) => ({ id: item.id, label: item.label }));

export function resolveSentinelNavId(pathname: string): SentinelNavId {
  if (pathname.startsWith("/sentinel/status")) return "status";
  if (pathname.startsWith("/sentinel/intake")) return "intake";
  if (pathname.startsWith("/sentinel/repos")) return "repos";
  if (pathname.startsWith("/sentinel/review") || pathname.startsWith("/sentinel/patches")) return "review";
  if (pathname.startsWith("/sentinel/reports")) return "reports";
  if (pathname.startsWith("/sentinel/history")) return "history";
  if (pathname.startsWith("/sentinel/settings")) return "settings";
  if (pathname.startsWith("/sentinel/scans") || pathname.startsWith("/sentinel/findings")) return "repos";
  return "overview";
}

export interface SentinelShellProps {
  title: React.ReactNode;
  description?: string;
  status?: { label: string; tone?: V2BadgeTone };
  actions?: React.ReactNode;
  breadcrumb?: V2BreadcrumbItem[];
  metadata?: Array<{ label: string; value: React.ReactNode }>;
  inspector?: React.ReactNode;
  detailTabs?: DetailTabItem[];
  activeDetailTab?: string;
  onDetailTabChange?: (id: string) => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Production Sentinel family shell.
 * Visual contract from SentinelSpecimens: dense ops header, family nav,
 * rows/dividers (no giant cards), DetailShell for identity/status/actions,
 * V2DataTable available for index surfaces. Owns no data and no fixtures.
 */
export function SentinelShell({
  title,
  description,
  status,
  actions,
  breadcrumb,
  metadata,
  inspector,
  detailTabs,
  activeDetailTab,
  onDetailTabChange,
  children,
  className,
}: SentinelShellProps) {
  const pathname = usePathname() ?? "/sentinel";
  const router = useRouter();
  const activeNav = resolveSentinelNavId(pathname);

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-4", className)} data-ethen-v2>
      <header data-v2-pattern="page-header" className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] text-[var(--v2-text-tertiary)]">Security</p>
          <h1 className="text-[20px] font-semibold leading-7 text-[var(--v2-text-primary)]">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-[720px] text-[13px] leading-[18px] text-[var(--v2-text-secondary)]">{description}</p>
          ) : null}
        </div>
        {status ? (
          <V2Badge tone={status.tone ?? "neutral"} size="sm">
            {status.label}
          </V2Badge>
        ) : null}
      </header>

      <nav data-v2-pattern="family-navigation" aria-label="Security">
        <V2Tabs
          items={NAV_TABS}
          value={activeNav}
          onValueChange={(id) => {
            const item = SENTINEL_NAV.find((entry) => entry.id === id);
            if (item) router.push(item.href);
          }}
        />
      </nav>

      <DetailShell
        breadcrumb={breadcrumb}
        title={title}
        status={status}
        actions={actions}
        metadata={metadata}
        tabs={detailTabs}
        activeTab={activeDetailTab}
        onTabChange={onDetailTabChange}
        inspector={inspector}
      >
        <div data-v2-pattern="data-surface" className="min-w-0">
          {children}
        </div>
      </DetailShell>

      <V2DataTable
        columns={[
          { id: "label", header: "Surface", cell: (row) => row.label },
          { id: "href", header: "Route", cell: (row) => row.href },
        ]}
        rows={SENTINEL_NAV.map((item) => ({ id: item.id, label: item.label, href: item.href }))}
        rowKey={(row) => row.id}
        aria-label="Security surfaces"
      />
    </div>
  );
}
