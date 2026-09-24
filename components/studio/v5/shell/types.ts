/**
 * STUDIO_08 — shared shell prop contracts.
 *
 * Published once for all V5 UI jobs (09/10/13/18 consume; they must not
 * fork these). Browser-safe: types only.
 */

/** Typed data states. Error is never empty; setup/permission are distinct. */
export type StudioDataState =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "setup"
  | "permission";

export interface StudioEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  testId?: string;
}

export interface StudioErrorStateProps {
  title: string;
  description: string;
  /** Retry is offered only when a retry can succeed (never for permission). */
  retryLabel?: string;
  onRetry?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  testId?: string;
}

export interface StudioPageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  routeMarker?: string;
  status?: React.ReactNode;
  actions?: React.ReactNode;
}

export interface StudioMediaCardProps {
  id: string;
  title: string;
  kind: string;
  href: string;
  imageUrl?: string;
  imageAlt?: string;
  statusLabel?: string;
  costLabel?: string;
  lineageLabel?: string;
  badge?: string;
}

export interface StudioAudioRowProps {
  id: string;
  title: string;
  durationLabel?: string;
  statusLabel?: string;
  costLabel?: string;
  waveformBars?: readonly number[];
  href: string;
}

export interface StudioLibrarySwitcherOption {
  id: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  disabledReason?: string;
}

export interface StudioLibraryFrameProps {
  title: string;
  scopeLabel?: string;
  searchValue: string;
  searchLabel: string;
  onSearchChange: (value: string) => void;
  view: "cards" | "table";
  onViewChange: (view: "cards" | "table") => void;
  filters?: React.ReactNode;
  switcher?: readonly StudioLibrarySwitcherOption[];
  activeSwitcherId?: string;
  selectionCount: number;
  selectionActions?: React.ReactNode;
  state: StudioDataState;
  emptyProps?: StudioEmptyStateProps;
  errorProps?: StudioErrorStateProps;
  onRetry?: () => void;
  children: React.ReactNode;
}

export interface StudioProjectSummary {
  id: string;
  name: string;
  assetCount?: number;
}

export interface StudioContinueTarget {
  projectId: string;
  projectName: string;
  href: string;
  jobLabel: string | null;
}

export interface StudioRecentAsset {
  id: string;
  title: string;
  kind: string;
  thumbnailUrl?: string;
}
