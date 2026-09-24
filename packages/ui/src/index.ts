/**
 * `@ethen/ui` — shared design system (U02-A closure).
 *
 * Physically owns the EDS/V2 design system, the primitive library, the icon
 * set, the theme store and the token authority. The package has zero imports
 * from the root monolith; every dependency points at another package.
 *
 * Primitives are exported here. Design-system, theme, icon, token and
 * command-system modules are reached by subpath (`@ethen/ui/design-system/...`)
 * so a server component never pulls the whole client graph through a barrel.
 */

export const PACKAGE_NAME = "./index" as const;
export const EXTRACTION_STATUS = "extracted" as const;

export { Button, buttonVariants } from "./button";
export type { ButtonProps, ButtonVariant, ButtonSize, ButtonVariantsOptions } from "./button";

export { IconButton } from "./icon-button";
export type { IconButtonProps } from "./icon-button";

export { Card } from "./card";
export type { CardProps } from "./card";

export { Panel, PanelHeader } from "./panel";
export type { PanelProps, PanelHeaderProps } from "./panel";

export { Chip } from "./chip";
export type { ChipProps } from "./chip";

export { Badge } from "./badge";
export type { BadgeProps, BadgeVariant } from "./badge";

export { StatusBadge } from "./status-badge";
export type { StatusBadgeProps, StatusTone } from "./status-badge";

export { Input, Textarea } from "./input";
export type { InputProps, TextareaProps } from "./input";

export { Field, FieldTextarea, FieldSelect, FieldWrapper } from "./field";
export type { FieldInputProps, FieldTextareaProps, FieldSelectProps, FieldWrapperProps } from "./field";

export { Skeleton } from "./skeleton";
export type { SkeletonProps } from "./skeleton";

export { EmptyState } from "./empty-state";
export type { EmptyStateProps } from "./empty-state";

export { InlineNotice } from "./inline-notice";
export type { InlineNoticeProps, NoticeTone } from "./inline-notice";

export { Tabs } from "./tabs";
export type { TabsProps, Tab } from "./tabs";

export { Modal } from "./modal";
export type { ModalProps } from "./modal";

export {
  LoadingShell,
  LoadingSpinner,
  ErrorPanel,
  NotFoundPanel,
  EmptyStateCard,
  NoticeBanner,
  ToolApprovalGate,
  ToolBlockedNotice,
} from "./state-surfaces";

export { ApprovalCard } from "./approval-card";
export type { ApprovalCardProps, ApprovalCardPayload, ApprovalCardAction } from "./approval-card";

export { AuditTimeline } from "./audit-timeline";
export type { AuditTimelineProps, AuditTimelineEntry } from "./audit-timeline";

export { EvidenceDrawer } from "./evidence-drawer";
export type { EvidenceDrawerProps, EvidenceItem } from "./evidence-drawer";

export { ProviderReceiptCard } from "./provider-receipt-card";
export type { ProviderReceiptCardProps, ProviderReceipt } from "./provider-receipt-card";
export { ArtifactCardShell } from "./artifact-card-shell";
export { ArtifactMetaBadge } from "./artifact-meta-badge";

// ── Ethen 4 console primitives ────────────────────────────────────────────────
export { Ethen4PageHeader } from "./ethen4-page-header";
export type { Ethen4PageHeaderProps } from "./ethen4-page-header";

export { Ethen4MetricCard } from "./ethen4-metric-card";
export type { Ethen4MetricCardProps } from "./ethen4-metric-card";

export { Ethen4StatusChip } from "./ethen4-status-chip";
export type { Ethen4StatusChipProps, Ethen4ChipTone } from "./ethen4-status-chip";

export { Ethen4Toolbar, Ethen4ToolbarSearch, Ethen4ToolbarIconButton } from "./ethen4-toolbar";
export type { Ethen4ToolbarProps } from "./ethen4-toolbar";

export { Ethen4EmptyState } from "./ethen4-empty-state";
export type { Ethen4EmptyStateProps } from "./ethen4-empty-state";

export { Ethen4Panel, Ethen4TableFrame } from "./ethen4-panel";
export type { Ethen4PanelProps, Ethen4TableFrameProps } from "./ethen4-panel";

export { ArtifactFrame, ArtifactCopyButton } from "./artifact-frame";

// ── Primitive Wave 1 — Gap Primitives ─────────────────────────────────────────
export { StatusDot } from "./status-dot";
export type { StatusDotProps, StatusDotTone, StatusDotSize } from "./status-dot";

export { Divider } from "./divider";
export type { DividerProps } from "./divider";

export { Spinner } from "./spinner";
export type { SpinnerProps, SpinnerSize } from "./spinner";

export { Kbd } from "./kbd";
export type { KbdProps } from "./kbd";

export { Timestamp } from "./timestamp";
export type { TimestampProps } from "./timestamp";

export { Tooltip } from "./tooltip";
export type { TooltipProps } from "./tooltip";

// ── Batch 1 Extra — Core Action/Content ────────────────────────────────────────
export { SegmentedControl } from "./segmented-control";
export type { SegmentedControlProps } from "./segmented-control";

export { SelectableCard } from "./selectable-card";
export type { SelectableCardProps } from "./selectable-card";

export { ClickableCard } from "./clickable-card";
export type { ClickableCardProps } from "./clickable-card";

export { ButtonGroup } from "./button-group";
export type { ButtonGroupProps, ButtonGroupItem } from "./button-group";

// ── FJ-06 — Shared interactive primitives ────────────────────────────────────
export { DropdownMenu } from "./dropdown-menu";
export type {
  DropdownMenuProps,
  DropdownMenuItem,
  DropdownMenuAction,
  DropdownMenuCheckbox,
  DropdownMenuSeparator,
} from "./dropdown-menu";

export { MoreMenu } from "./more-menu";
export type { MoreMenuProps, MoreMenuItem, MoreMenuActionItem } from "./more-menu";

export { Popover } from "./popover";
export type { PopoverProps } from "./popover";

export { Dialog } from "./dialog";
export type { DialogProps } from "./dialog";

export { isMenuKey, resolveMenuKey } from "./menu-key";
export type { MenuKeyAction, ResolveMenuKeyOptions } from "./menu-key";
