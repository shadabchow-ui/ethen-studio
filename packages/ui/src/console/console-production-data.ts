/**
 * Production Console data contracts.
 *
 * Promoted from the certified Console lab for the post-launch UI correction.
 * This module carries ONLY production-safe contracts: workspace identity
 * types, status vocabulary, chart point types and number formatters.
 *
 * It deliberately carries NO mock rows, NO demo workspaces, NO demo account,
 * NO demo commands and NO demo series. Production figures always come from
 * production sources (auth/session, API, workspace state, usage, billing,
 * keys, account data). Fixtures from `components/dev/ethen-console-lab`
 * must never become production source-of-truth.
 */

import type { ConsoleIconName } from "./console-icons";

export type WorkspaceId = string;

export type ConsoleWorkspace = Readonly<{
  id: WorkspaceId;
  name: string;
  detail: string;
}>;

export type ConsoleAccount = Readonly<{
  name: string;
  role: string;
  email: string;
  initials: string;
}>;

export type ConsolePaletteItem = Readonly<{
  id: string;
  label: string;
  detail: string;
  icon: ConsoleIconName;
}>;

export type ConsoleStatusState =
  | "healthy"
  | "running"
  | "pending"
  | "failed"
  | "paused"
  | "disabled";

export type SeriesPoint = Readonly<{ label: string; value: number }>;

export function formatCount(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

export function formatCurrency(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
