"use client";

/**
 * CONSOLE_A1 — the Console primitive set.
 *
 * These are the parts every Console page is made of. EDS primitives are used
 * wherever the Console needs exactly the control EDS already ships (EdsButton
 * at compact density, EdsInput, EdsSelect, EdsKbd, EdsSwitch, EdsCheckbox,
 * EdsStatus, EdsBadge); what is authored here is the COMPOSITION EDS has no
 * opinion about — the page-width system, the metric strip, the operational
 * table, filters, product cards and the billing block.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { EdsButton } from "@ethen/ui/design-system/eds/primitives/Button";
import { EdsStatus } from "@ethen/ui/design-system/eds/primitives/Status";
import { ConsoleIcon, type ConsoleIconName } from "./console-icons";
import { type ConsoleStatusState } from "./console-production-data";
import {
  focusFirstTaskControl,
  useFocusTrap,
  useLockBodyScroll,
  useRestoreFocus,
} from "./console-overlay-hooks";
import styles from "./console-primitives.module.css";

/* ------------------------------------------------------- the width system */

/**
 * Page width depends on the task, never on a single global max (spec §34).
 *
 *   readable  960px   billing, settings, security — long-form configuration
 *   standard 1120px   dashboard, projects, all products
 *   wide     1440px   API keys, members, service accounts, large tables
 *   fluid      —      analytics, logs, immersive product workspaces
 */
export type ConsoleWidth = "readable" | "standard" | "wide" | "fluid";

export function ConsolePage({
  width = "standard",
  children,
  className,
}: {
  width?: ConsoleWidth;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={styles.page} data-width={width}>
      <div className={[styles.pageInner, className].filter(Boolean).join(" ")}>{children}</div>
    </div>
  );
}

export function ConsolePageHeader({
  title,
  description,
  count,
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderMain}>
        <h1 className={styles.pageTitle}>
          {title}
          {count !== undefined ? <span className={styles.pageCount}>{count}</span> : null}
        </h1>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
      </div>
      {meta ? <div className={styles.pageMeta}>{meta}</div> : null}
      {actions ? <div className={styles.pageActions}>{actions}</div> : null}
    </header>
  );
}

export function ConsoleSection({
  title,
  action,
  children,
  id,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const headingId = id ?? `section-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section className={[styles.section, className].filter(Boolean).join(" ")} aria-labelledby={headingId}>
      <header className={styles.sectionHeader}>
        <h2 id={headingId} className={styles.sectionTitle}>
          {title}
        </h2>
        {action ? <div className={styles.sectionAction}>{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Production notice line. Callers always supply honest production copy. */
export function MockNotice({ children }: { children?: React.ReactNode }) {
  return (
    <p className={styles.mockNotice}>
      <ConsoleIcon name="info" />
      {children ?? "No additional details."}
    </p>
  );
}

/* ------------------------------------------------------------ metric strip */

/**
 * Deliberately NOT four floating cards. Four measures share ONE bordered strip
 * divided by hairlines — an instrument cluster, not a set of widgets. It is the
 * clearest single break from the reference's dashboard grammar, and it stops the
 * page becoming card soup before it has said anything.
 */
export function ConsoleMetricStrip({ children }: { children: React.ReactNode }) {
  return <div className={styles.metricStrip}>{children}</div>;
}

export function ConsoleMetric({
  label,
  value,
  detail,
  delta,
  action,
  loading = false,
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: Readonly<{ direction: "rise" | "fall"; value: string; tone: "good" | "bad" | "neutral" }>;
  action?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className={styles.metric}>
      <p className={styles.metricLabel}>{label}</p>
      {loading ? (
        <span className={styles.skeletonValue} role="status" aria-label={`${label} loading`} />
      ) : (
        <p className={styles.metricValue}>{value}</p>
      )}
      <div className={styles.metricFoot}>
        {detail && !loading ? <span className={styles.metricDetail}>{detail}</span> : null}
        {delta && !loading ? (
          <span className={styles.metricDelta} data-tone={delta.tone}>
            <ConsoleIcon name={delta.direction} size={16} />
            {delta.value}
            <span className={styles.srOnly}>{delta.direction === "rise" ? " increase" : " decrease"}</span>
          </span>
        ) : null}
        {action && !loading ? <span className={styles.metricAction}>{action}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ status */

const STATUS_TONE = {
  healthy: "success",
  running: "selected",
  pending: "pending",
  failed: "failure",
  paused: "informational",
  disabled: "neutral",
} as const;

const STATUS_LABEL: Record<ConsoleStatusState, string> = {
  healthy: "Healthy",
  running: "Running",
  pending: "Pending",
  failed: "Failed",
  paused: "Paused",
  disabled: "Disabled",
};

/**
 * Console status vocabulary mapped onto the EDS status primitive, which already
 * renders a dot AND a glyph AND the word. Status is never colour alone
 * (spec §86) and the mapping is the only Console-specific part.
 */
export function ConsoleStatus({ state, className }: { state: ConsoleStatusState; className?: string }) {
  return (
    <EdsStatus tone={STATUS_TONE[state]} className={[styles.status, className].filter(Boolean).join(" ")}>
      {STATUS_LABEL[state]}
    </EdsStatus>
  );
}

/* ------------------------------------------------------------------- cards */

export function ConsoleCard({
  children,
  className,
  as: Element = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  return <Element className={[styles.card, className].filter(Boolean).join(" ")}>{children}</Element>;
}

export function ConsoleProductCard({
  name,
  purpose,
  context,
  icon,
  onOpen,
}: {
  name: string;
  purpose: string;
  context: string;
  icon: ConsoleIconName;
  onOpen?: () => void;
}) {
  return (
    <li className={styles.productCard}>
      <span className={styles.productIcon} aria-hidden>
        <ConsoleIcon name={icon} size={20} />
      </span>
      <div className={styles.productBody}>
        <h3 className={styles.productName}>{name}</h3>
        <p className={styles.productPurpose}>{purpose}</p>
        <p className={styles.productContext}>{context}</p>
      </div>
      <EdsButton variant="secondary" density="compact" className={styles.productOpen} onClick={onOpen}>
        Open<span className={styles.srOnly}> {name}</span>
      </EdsButton>
    </li>
  );
}

export function ConsoleActivityRow({
  name,
  type,
  detail,
  status,
  icon,
  onOpen,
}: {
  name: string;
  type: string;
  detail: string;
  status: ConsoleStatusState;
  icon: ConsoleIconName;
  /** CONSOLE_C1 — Continue-working rows navigate like their rail destination. */
  onOpen?: () => void;
}) {
  return (
    <li className={styles.activityRow}>
      <span className={styles.activityIcon} aria-hidden>
        <ConsoleIcon name={icon} />
      </span>
      {/* CONSOLE_C4 — when desktop Open hides on phones, the name itself stays
       * tappable. Without a handler the name is plain text: no dead control. */}
      {onOpen ? (
        <button type="button" className={styles.activityNameButton} onClick={onOpen} aria-label={`Open ${name}`}>
          <span className={styles.activityName}>{name}</span>
        </button>
      ) : (
        <span className={styles.activityName}>{name}</span>
      )}
      <span className={styles.activityType}>{type}</span>
      <span className={styles.activityDetail}>{detail}</span>
      <ConsoleStatus state={status} className={styles.activityStatus} />
      <EdsButton variant="quiet" density="compact" className={styles.activityOpen} onClick={onOpen}>
        Open<span className={styles.srOnly}> {name}</span>
      </EdsButton>
    </li>
  );
}

/* ------------------------------------------------------------------ tables */

export type ConsoleColumn<Row> = Readonly<{
  id: string;
  header: string;
  align?: "start" | "end";
  width?: string;
  /**
   * Column priority at 390px. `primary` stays in the collapsed row, `meta`
   * joins the supporting line, `detail` appears only when the row is expanded.
   * A 1400px table that merely scrolls sideways is not a mobile design.
   */
  mobile: "primary" | "meta" | "detail";
  /**
   * Mobile rows prefix each meta/detail value with its column name. A cell that
   * already names itself — a status word, a badge — opts out rather than
   * reading "Status · Healthy".
   */
  selfLabelling?: boolean;
  /**
   * CONSOLE_C5 — the column that names the row (key name, invoice id) renders
   * as a row header instead of a plain cell.
   */
  rowHeader?: boolean;
  cell: (row: Row) => React.ReactNode;
}>;

export type TableState = "ready" | "loading" | "empty" | "filtered-empty" | "error";

/**
 * A flat operational table: hairline dividers, a quiet header, no outer card,
 * no zebra stripes (spec §80). Explicit ARIA roles are declared because the
 * mobile layout changes `display`, which otherwise strips table semantics from
 * the accessibility tree.
 */
export function ConsoleTable<Row extends { id: string }>({
  caption,
  columns,
  rows,
  state = "ready",
  empty,
  filteredEmpty,
  error,
  rowMenuLabel = "Row actions",
  rowActionLabel,
  onRowMenu,
  density = "comfortable",
  stickyHeader = false,
}: {
  caption: string;
  columns: readonly ConsoleColumn<Row>[];
  rows: readonly Row[];
  state?: TableState;
  empty?: React.ReactNode;
  filteredEmpty?: React.ReactNode;
  error?: React.ReactNode;
  rowMenuLabel?: string;
  /**
   * CONSOLE_C5 — per-row action label ("Key actions for Acme") so the
   * trigger identifies its row. Falls back to `rowMenuLabel`.
   */
  rowActionLabel?: (row: Row) => string;
  onRowMenu?: (row: Row) => void;
  density?: "comfortable" | "compact";
  /**
   * CONSOLE_C5 — pins the header while a genuinely long table scrolls.
   * Off by default: short tables must not pay for chrome they never use.
   */
  stickyHeader?: boolean;
}) {
  const [expanded, setExpanded] = React.useState<readonly string[]>([]);
  const hasDetail = columns.some((column) => column.mobile === "detail");
  /* CONSOLE_C3 — the action trigger renders only when actions exist: a row
   * menu handler, a detail disclosure, or neither (then no dead trigger). */
  const showActions = onRowMenu !== undefined || hasDetail;

  if (state === "loading") return <TableSkeleton columns={columns.length} caption={caption} />;
  if (state === "empty") return <div className={styles.tableState}>{empty}</div>;
  if (state === "filtered-empty") return <div className={styles.tableState}>{filteredEmpty}</div>;
  if (state === "error") return <div className={styles.tableState}>{error}</div>;

  return (
    <div className={styles.tableWrap} data-sticky={stickyHeader ? "true" : undefined}>
      <table className={styles.table} role="table" data-density={density}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th
                key={column.id}
                role="columnheader"
                scope="col"
                data-align={column.align ?? "start"}
                data-mobile={column.mobile}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.header}
              </th>
            ))}
            {showActions ? (
              <th role="columnheader" scope="col" className={styles.tableMenuHead}>
                <span className={styles.srOnly}>Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => {
            const open = expanded.includes(row.id);
            return (
              <tr key={row.id} role="row" data-expanded={open ? "true" : undefined}>
                {columns.map((column) =>
                  column.rowHeader ? (
                    <th
                      key={column.id}
                      role="rowheader"
                      scope="row"
                      data-align={column.align ?? "start"}
                      data-mobile={column.mobile}
                      data-label={column.selfLabelling ? undefined : column.header}
                    >
                      {column.cell(row)}
                    </th>
                  ) : (
                    <td
                      key={column.id}
                      role="cell"
                      data-align={column.align ?? "start"}
                      data-mobile={column.mobile}
                      data-label={column.selfLabelling ? undefined : column.header}
                    >
                      {column.cell(row)}
                    </td>
                  ),
                )}
                {showActions ? (
                  <td role="cell" className={styles.tableMenuCell}>
                    {hasDetail ? (
                      <button
                        type="button"
                        className={styles.rowExpand}
                        aria-expanded={open}
                        onClick={() =>
                          setExpanded((ids) => (ids.includes(row.id) ? ids.filter((id) => id !== row.id) : [...ids, row.id]))
                        }
                      >
                        <ConsoleIcon name="chevron-down" />
                        <span className={styles.srOnly}>{open ? "Hide details" : "Show details"}</span>
                      </button>
                    ) : null}
                    {onRowMenu ? (
                      <button type="button" className={styles.rowMenu} onClick={() => onRowMenu(row)}>
                        <ConsoleIcon name="more" />
                        <span className={styles.srOnly}>{rowActionLabel ? rowActionLabel(row) : rowMenuLabel}</span>
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton({ columns, caption }: { columns: number; caption: string }) {
  return (
    <div className={styles.tableWrap} role="status" aria-label={`${caption} loading`}>
      <div className={styles.skeletonHead} />
      {Array.from({ length: 6 }, (_, row) => (
        <div className={styles.skeletonRow} key={row}>
          {Array.from({ length: Math.min(columns, 5) }, (_, cell) => (
            <span className={styles.skeletonCell} key={cell} data-index={cell} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- filters */

export type FilterDefinition = Readonly<{
  id: string;
  label: string;
  options: readonly Readonly<{ value: string; label: string }>[];
}>;

/**
 * Filters sit between the page header and the table, never inside a card
 * (spec §39). The search field and each select are real form controls.
 */
export function ConsoleFilters({
  searchLabel = "Search",
  searchPlaceholder = "Search",
  search,
  onSearch,
  filters,
  values,
  onChange,
  onClear,
  resultNote,
}: {
  searchLabel?: string;
  searchPlaceholder?: string;
  search: string;
  onSearch: (value: string) => void;
  filters: readonly FilterDefinition[];
  values: Readonly<Record<string, string>>;
  onChange: (id: string, value: string) => void;
  onClear?: () => void;
  resultNote?: string;
}) {
  const dirty = search.length > 0 || filters.some((filter) => values[filter.id] !== filter.options[0]?.value);
  /* CONSOLE_C4 — crowded phones get Search + a Filters count disclosure; the
   * selects collapse behind it instead of filling the screen. */
  const activeCount = filters.filter((filter) => values[filter.id] !== filter.options[0]?.value).length;
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  return (
    <div className={styles.filters}>
      <div className={styles.filterSearch}>
        <ConsoleIcon name="search" className={styles.filterSearchIcon} />
        <input
          className={styles.filterInput}
          type="search"
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      <button
        type="button"
        className={styles.filtersToggle}
        aria-expanded={filtersOpen}
        aria-controls="console-filter-selects"
        onClick={() => setFiltersOpen((open) => !open)}
      >
        <ConsoleIcon name="filter" className={styles.filterSearchIcon} />
        Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
      </button>
      <div className={styles.filterSelects} id="console-filter-selects" data-open={filtersOpen ? "true" : undefined}>
        {filters.map((filter) => (
          <label className={styles.filterSelect} key={filter.id}>
            <span className={styles.filterSelectLabel}>{filter.label}</span>
            <select value={values[filter.id]} onChange={(event) => onChange(filter.id, event.target.value)}>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ConsoleIcon name="chevron-down" className={styles.filterChevron} />
          </label>
        ))}
      </div>
      {resultNote ? <span className={styles.filterNote}>{resultNote}</span> : null}
      {dirty && onClear ? (
        <EdsButton variant="quiet" density="compact" onClick={onClear} className={styles.filterClear}>
          Clear filters
        </EdsButton>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ states */

export function ConsoleEmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyDetail}>{detail}</p>
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}

/**
 * Errors are LOCAL to the operation that failed (spec §113). One widget losing
 * its data never replaces the Console with an error screen.
 */
export function ConsoleErrorState({
  title,
  detail,
  onRetry,
  compact = false,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={styles.errorState} data-compact={compact ? "true" : undefined} role="alert">
      <ConsoleIcon name="warning" className={styles.errorIcon} />
      <div className={styles.errorBody}>
        <p className={styles.errorTitle}>{title}</p>
        {detail ? <p className={styles.errorDetail}>{detail}</p> : null}
      </div>
      {onRetry ? (
        <EdsButton variant="secondary" density="compact" onClick={onRetry}>
          Retry
        </EdsButton>
      ) : null}
    </div>
  );
}

export function ConsoleSkeletonBlock({ height, label }: { height: number; label: string }) {
  return <span className={styles.skeletonBlock} style={{ height }} role="status" aria-label={label} />;
}

/* ----------------------------------------------------------------- dialog */

/* CONSOLE_C5_1 — open-dialog count guarding the shell inert flag. Lab dialogs
 * never nest, but sequential dialogs (create → secret review) must not clear
 * each other's background lock. */
let openDialogCount = 0;

/** True while any Console dialog owns the screen (palette stays shut). */
export function isConsoleDialogOpen(): boolean {
  return openDialogCount > 0;
}

export function ConsoleDialog({
  open,
  title,
  description,
  onClose,
  footer,
  children,
  width = 520,
  destructive = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  /**
   * CONSOLE_C2 — destructive dialogs use alertdialog semantics and must name
   * the object and consequence in title/description. No destructive dialog
   * exists on the C1 surfaces; the contract is ready for C3 mutations.
   */
  destructive?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  /* CONSOLE_C2 — one top modal layer: trapped Tab, restored opener focus,
   * locked scroll, first task field focused, safe Escape close. */
  useFocusTrap(ref, open);
  useRestoreFocus(open);
  useLockBodyScroll(open);
  /* CONSOLE_C5_1 — the dialog owns the screen while open: the Console shell
   * behind it goes inert (same discipline as the drawer/palette background),
   * so background controls leave both pointer and focus navigation. The flag
   * is always restored on close; the count keeps sequential dialogs honest. */
  React.useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const root = document.querySelector("[data-ethen-console]");
    if (!root) return;
    openDialogCount += 1;
    root.setAttribute("inert", "");
    return () => {
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0) root.removeAttribute("inert");
    };
  }, [open ]);
  React.useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const node = ref.current;
      if (node) focusFirstTaskControl(node, '[role="menuitem"],[role="menuitemradio"]');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open ]);

  if (!open) return null;
  /* Portalled to the document body: the scrim covers the viewport and the
   * shell inert flag above never traps the dialog inside its own lock. */
  const node = (
    <div className={styles.dialogScrim} onMouseDown={onClose}>
      <div
        className={styles.dialog}
        style={{ width }}
        role={destructive ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="console-dialog-title"
        aria-describedby={description ? "console-dialog-description" : undefined}
        ref={ref}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="console-dialog-title" className={styles.dialogTitle}>
              {title}
            </h2>
            {description ? (
              <p className={styles.dialogDescription} id="console-dialog-description">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className={styles.dialogClose} onClick={onClose}>
            <ConsoleIcon name="close" />
            <span className={styles.srOnly}>Close</span>
          </button>
        </header>
        <div className={styles.dialogBody}>{children}</div>
        {footer ? <footer className={styles.dialogFooter}>{footer}</footer> : null}
      </div>
    </div>
  );
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

/* ------------------------------------------------------------------- tabs */

export function ConsoleTabs({
  label,
  tabs,
  value,
  onChange,
  panelId,
}: {
  label: string;
  tabs: readonly Readonly<{ id: string; label: string }>[];
  value: string;
  onChange: (id: string) => void;
  /**
   * CONSOLE_C2 — when the tabs drive one shared panel, every tab controls it
   * and the panel labels itself with the selected tab. Otherwise each tab
   * keeps its own `panel-<id>` target.
   */
  panelId?: string;
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={tab.id === value}
          aria-controls={panelId ?? `panel-${tab.id}`}
          tabIndex={tab.id === value ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            const index = tabs.findIndex((candidate) => candidate.id === value);
            if (event.key === "ArrowRight") onChange(tabs[(index + 1) % tabs.length].id);
            if (event.key === "ArrowLeft") onChange(tabs[(index - 1 + tabs.length) % tabs.length].id);
            if (event.key === "Home") onChange(tabs[0].id);
            if (event.key === "End") onChange(tabs[tabs.length - 1].id);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * CONSOLE_C2 — the real panel a tab selection points at. Keyboard focus,
 * selected state and panel stay matched through `labelledBy`.
 */
export function ConsoleTabPanel({
  id,
  labelledBy,
  children,
  className,
}: {
  id: string;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="tabpanel" id={id} aria-labelledby={labelledBy} tabIndex={0} className={className}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- form field */

export function ConsoleField({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={htmlFor}>
        {label}
      </label>
      {description ? <p className={styles.fieldDescription}>{description}</p> : null}
      {children}
    </div>
  );
}

export { styles as consoleStyles };
