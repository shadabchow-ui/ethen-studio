/**
 * Studio V5 — restored original generator grammar.
 *
 * Visual authority: the original "Ethen Studio Generator" workspace —
 * compact mode tabs over a large center stage, a wide floating composer at
 * the bottom, and a right "Run settings" inspector. Only the workspace is
 * restored: the shared Ethen console sidebar stays the far-left owner and
 * the mock's own left rail/top bar are not reintroduced. The Studio scroll
 * root stays the single vertical scroll owner; the composer and inspector
 * are sticky inside it. Below lg the inspector becomes an in-flow sheet.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { studioCreateHref, studioDestinations, studioLegacyAppStatus } from "../../../../lib/studio-v5/showcase";

const focus = STUDIO_FOCUS_RING_CLASS;

export type GeneratorModality = "visual" | "audio";

export function modalityFor(toolId: string): GeneratorModality {
  return toolId === "image" || toolId === "edit" || toolId === "video" || toolId === "3d" ? "visual" : "audio";
}

export interface ModeTab {
  id: string;
  label: string;
  href: string;
  status?: string;
}

/** Fast workspace switching between canonical V5 creation routes (not a global nav). */
export function generatorModeTabs(modality: GeneratorModality, projectId: string | null): ModeTab[] {
  if (modality === "audio") {
    return [
      { id: "voice", label: "Voice", href: studioCreateHref("voice", projectId) },
      { id: "music", label: "Music", href: studioCreateHref("music", projectId) },
      { id: "sfx", label: "Sound effects", href: studioCreateHref("sfx", projectId) },
      { id: "transcribe", label: "Transcribe", href: studioCreateHref("transcribe", projectId) },
      { id: "dub", label: "Dub", href: studioCreateHref("dub", projectId) },
      { id: "changer", label: "Change voice", href: studioCreateHref("changer", projectId) },
    ];
  }
  const to = studioDestinations(projectId);
  const productAd = studioLegacyAppStatus("product-ad");
  return [
    { id: "image", label: "Create Image", href: to.createImage },
    { id: "edit", label: "Edit Image", href: studioCreateHref("edit", projectId) },
    { id: "video", label: "Create Video", href: to.createVideo },
    { id: "3d", label: "Create 3D", href: studioCreateHref("3d", projectId) },
    { id: "product-ad", label: "Product Ad", href: productAd.href, status: productAd.statusLabel },
    { id: "influencer", label: "AI Influencer", href: to.influencer },
    { id: "cinema", label: "Cinema", href: to.cinema },
  ];
}

/** Context-bar pill and inspector control height: 32px on fine pointers, 44px on touch. */
export const GENERATOR_CONTROL_HEIGHT = "min-h-[32px] pointer-coarse:min-h-[44px]";

/**
 * `tabs` overrides the modality's default set for surfaces whose modes are
 * routes of their own (the project-scoped workspace). Same bar, same
 * grammar — only the destinations differ. The bar is one 54px row at every
 * width: tabs scroll horizontally, and below md the status (model chip)
 * folds into the composer, which carries its own model control.
 */
export function GeneratorModeTabs({ activeId, modality, projectId, status, tabs: tabsOverride }: { activeId: string; modality: GeneratorModality; projectId: string | null; status?: React.ReactNode; tabs?: readonly ModeTab[] }) {
  const tabs = tabsOverride ?? generatorModeTabs(modality, projectId);
  const navRef = React.useRef<HTMLElement | null>(null);
  const [overflow, setOverflow] = React.useState<{ start: boolean; end: boolean }>({ start: false, end: false });
  // Phones scroll the tab row: bring the active mode into view on arrival.
  React.useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, [activeId]);
  // Final polish: a clipped tab row fades at the clipped edge instead of
  // cutting a label in half.
  React.useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      setOverflow((prev) => {
        const next = { start: max > 1 && nav.scrollLeft > 1, end: max > 1 && nav.scrollLeft < max - 1 };
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    };
    const frame = requestAnimationFrame(measure);
    nav.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(nav);
    return () => {
      cancelAnimationFrame(frame);
      nav.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);
  const fadeMask =
    overflow.start && overflow.end
      ? "[mask-image:linear-gradient(to_right,transparent,black_28px,black_calc(100%-28px),transparent)]"
      : overflow.end
        ? "[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)]"
        : overflow.start
          ? "[mask-image:linear-gradient(to_right,transparent,black_28px)]"
          : "";
  return (
    <div data-testid="create-context-bar" className="flex h-[54px] shrink-0 items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-4 md:px-6">
      <nav ref={navRef} aria-label="Creation modes" className={`relative -mx-1 flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${fadeMask}`}>
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              title={tab.status}
              className={`inline-flex ${GENERATOR_CONTROL_HEIGHT} shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] border px-[13px] text-[12.5px] leading-none transition-colors ${active ? "border-[var(--border-default)] bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)]" : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"} ${focus}`}
            >
              {tab.label}
              {tab.status ? <span className="rounded-[5px] bg-[var(--bg-inset)] px-1 py-0.5 text-[9.5px] text-[var(--text-secondary)]">{tab.status}</span> : null}
            </Link>
          );
        })}
      </nav>
      {status ? <div className="hidden min-w-0 shrink md:block">{status}</div> : null}
    </div>
  );
}

/*
 * Empty-stage note: the stage previously rendered decorative preview
 * cards from showcase media. Per DECORATIVE_CREATE_STAGE_IMAGES=REMOVE
 * the empty stage is now title + guidance + one next action. The
 * in-flight shimmer (GENERATING_SLOT) stays: it is functional, not
 * decorative.
 */

/** The slot that becomes the "Generating" shimmer while a real job is in flight. */
const GENERATING_SLOT = 3;

function GeneratingSlot({ phase }: { phase: string }) {
  return (
    <div
      role="status"
      data-testid="create-generating-slot"
      data-generating-slot={GENERATING_SLOT}
      className="relative mx-auto mt-6 w-full max-w-[430px] overflow-hidden rounded-[13px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-4 py-5 shadow-[0_14px_40px_rgb(0_0_0/0.5)]"
    >
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(100deg,var(--bg-inset)_30%,var(--bg-elevated)_50%,var(--bg-inset)_70%)] bg-[length:200%_100%] motion-safe:animate-pulse" />
      <span className="relative flex items-center justify-center gap-[7px] text-[12.5px] text-[var(--text-secondary)]">
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="motion-safe:animate-spin">
          <path d="M21 12a9 9 0 1 1-6.2-8.6" strokeLinecap="round" />
        </svg>
        {phase}
      </span>
    </div>
  );
}

function focusPromptField(promptFieldId: string | null) {
  if (typeof document === "undefined") return;
  if (promptFieldId) {
    document.getElementById(promptFieldId)?.focus();
    return;
  }
  document.querySelector<HTMLElement>('[data-testid="create-composer"] textarea, [data-testid="create-composer"] input')?.focus();
}

export function GeneratorEmptyStage({
  title,
  lead,
  modality,
  generating = null,
  promptFieldId = null,
  children,
}: {
  title: string;
  lead: string;
  modality: GeneratorModality;
  /** Phase label while a real job is in flight; turns the stage into the shimmer. */
  generating?: string | null;
  /** Id of the composer prompt field; the next action focuses it. */
  promptFieldId?: string | null;
  children?: React.ReactNode;
}) {
  const showStartAction = !generating && !children;
  return (
    <div data-testid="create-empty-stage" data-modality={modality} className="relative flex min-h-[340px] flex-1 flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="relative z-10 w-full max-w-[410px] text-center">
        {/* Visual title; the page h1 (with the route identity marker) lives in GeneratorLayout. */}
        <p aria-hidden="true" className="text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)] md:text-[34px]">{title}</p>
        <p className="mx-auto mt-3 max-w-[430px] text-[13.5px] leading-[1.55] text-[var(--text-secondary)]">{lead}</p>
        {generating ? <GeneratingSlot phase={generating} /> : null}
        {children ? <div className="mt-5">{children}</div> : null}
        {showStartAction ? (
          <div className="mt-5">
            <button
              type="button"
              data-testid="create-empty-stage-start"
              onClick={() => focusPromptField(promptFieldId)}
              className={`inline-flex min-h-[44px] items-center rounded-[10px] bg-[var(--bg-elevated)] px-4 py-2 text-[12.5px] font-medium text-[var(--text-primary)] transition hover:bg-[var(--studio-bg-selected)] ${focus}`}
            >
              Start with a prompt
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InspectorSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="mb-[22px]">
      <div className="mb-[9px] flex min-h-[16px] items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold leading-none text-[var(--text-secondary)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type InspectorPane = "settings" | "history";

/** The Settings | History segmented switch at the top of the inspector. */
function InspectorPaneSwitch({ pane, onChange, baseId }: { pane: InspectorPane; onChange: (pane: InspectorPane) => void; baseId: string }) {
  const panes: readonly { id: InspectorPane; label: string }[] = [
    { id: "settings", label: "Settings" },
    { id: "history", label: "History" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Inspector view"
      className="mb-[22px] grid grid-cols-2 gap-1 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-inset)] p-[3px]"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = pane === "settings" ? "history" : "settings";
        onChange(next);
        document.getElementById(`${baseId}-tab-${next}`)?.focus();
      }}
    >
      {panes.map((option) => {
        const selected = option.id === pane;
        return (
          <button
            key={option.id}
            id={`${baseId}-tab-${option.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${option.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.id)}
            className={`${GENERATOR_CONTROL_HEIGHT} rounded-[8px] text-[12px] transition-colors ${selected ? "bg-[var(--bg-elevated)] font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgb(0_0_0/0.35)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"} ${focus}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function InspectorBody({ inspector, history, baseId }: { inspector: React.ReactNode; history?: React.ReactNode; baseId: string }) {
  const [pane, setPane] = React.useState<InspectorPane>("settings");
  if (!history) return <>{inspector}</>;
  return (
    <>
      <InspectorPaneSwitch pane={pane} onChange={setPane} baseId={baseId} />
      <div role="tabpanel" id={`${baseId}-panel-settings`} aria-labelledby={`${baseId}-tab-settings`} hidden={pane !== "settings"}>
        {inspector}
      </div>
      <div role="tabpanel" id={`${baseId}-panel-history`} aria-labelledby={`${baseId}-tab-history`} hidden={pane !== "history"} data-testid="create-inspector-history">
        {history}
      </div>
    </>
  );
}

/**
 * Below lg the inspector is a drawer: a right sheet from md, a bottom sheet
 * on phones. It stays mounted (inert while closed) so nothing the user set
 * is lost; Escape closes it and focus returns to the invoker.
 */
function InspectorDrawer({
  id,
  open,
  onClose,
  title,
  children,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLElement | null>(null);
  const invokerRef = React.useRef<Element | null>(null);
  React.useEffect(() => {
    if (!open) return;
    invokerRef.current = document.activeElement;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[data-testid="studio-model-switcher"]')) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      const invoker = invokerRef.current;
      if (invoker instanceof HTMLElement && invoker.isConnected) invoker.focus();
    };
  }, [open, onClose]);

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 cursor-default bg-[var(--studio-bg-app)]/60 transition-opacity duration-200 motion-reduce:transition-none ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        ref={panelRef}
        id={id}
        aria-label={title}
        data-testid="create-inspector"
        data-state={open ? "open" : "closed"}
        tabIndex={-1}
        inert={!open}
        className={`fixed z-50 flex flex-col overscroll-contain border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_20px_60px_rgb(0_0_0/0.55)] outline-none motion-reduce:[transition:none] max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[85dvh] max-md:rounded-t-[18px] max-md:border-t max-md:pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:right-0 md:w-[340px] md:border-l ${open ? "visible translate-x-0 translate-y-0 [transition:transform_200ms_ease-out,visibility_0s]" : "invisible max-md:translate-y-full md:translate-x-full [transition:transform_200ms_ease-in,visibility_0s_linear_200ms]"}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className={`mx-auto mt-2 flex h-6 w-16 shrink-0 items-center justify-center rounded-full md:hidden ${focus}`}
        >
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-[var(--border-strong)]" />
        </button>
        <div className="flex shrink-0 items-center justify-between gap-3 px-[18px] pb-2 pt-2 md:pt-[18px]">
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[9px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] ${focus}`}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-6 pt-2">{children}</div>
      </aside>
    </>
  );
}

/**
 * The three-zone frame. `inspector` renders once: pinned right on lg+ as
 * the 300px Run settings column, and below lg as a drawer opened from the
 * edge handle (md) or the composer's Settings button. `history`, when
 * given, sits behind the inspector's Settings | History switch so the stage
 * keeps the approved proportions.
 */
export function GeneratorLayout({
  title,
  routeMarker,
  tabs,
  stage,
  below,
  history,
  composer,
  inspector,
  inspectorTitle = "Run settings",
  testId,
}: {
  /** Page title; rendered as the focusable h1 that carries the route identity marker. */
  title: string;
  routeMarker: string;
  tabs: React.ReactNode;
  stage: React.ReactNode;
  below?: React.ReactNode;
  /** Run history; rendered behind the inspector's History view. */
  history?: React.ReactNode;
  /** Omitted when the surface has no prompt of its own (e.g. Director owns input in Automate). */
  composer?: (openSettings: (() => void) | null) => React.ReactNode;
  inspector: React.ReactNode;
  inspectorTitle?: string;
  testId?: string;
}) {
  const [wide, setWide] = React.useState(true);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const settingsId = React.useId();
  const paneId = React.useId();
  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setWide(query.matches);
      if (query.matches) setDrawerOpen(false);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const openSettings = React.useCallback(() => setDrawerOpen(true), []);
  const closeSettings = React.useCallback(() => setDrawerOpen(false), []);
  const body = <InspectorBody inspector={inspector} history={history} baseId={paneId} />;

  return (
    <div data-testid={testId ?? "create-generator"} className="flex min-h-[100dvh] min-w-0 flex-col max-[768px]:min-h-[calc(100dvh-44px)] lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col bg-[radial-gradient(120%_90%_at_50%_0%,var(--bg-surface)_0%,var(--bg-base)_60%)]">
        <h1 tabIndex={-1} data-iex-route={routeMarker} className="sr-only">{title}</h1>
        {tabs}
        <div data-testid="create-stage" className="flex min-h-[340px] flex-1 flex-col">{stage}</div>
        {below ? <div className="px-4 pb-6 sm:px-6">{below}</div> : null}
        {composer ? (
          <div data-testid="create-composer" className="sticky bottom-0 z-20 flex justify-center bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)]/90 to-transparent px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-[26px] md:pt-0">
            {composer(wide ? null : openSettings)}
          </div>
        ) : null}
      </div>
      {wide ? (
        <aside
          aria-label={inspectorTitle}
          data-testid="create-inspector"
          className="hidden w-[300px] shrink-0 overscroll-contain border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] px-[18px] pb-6 pt-[18px] lg:sticky lg:top-0 lg:block lg:h-[100dvh] lg:self-start lg:overflow-y-auto"
        >
          <p className="mb-[18px] text-[14px] font-semibold leading-[1.2] text-[var(--text-primary)]">{inspectorTitle}</p>
          {body}
        </aside>
      ) : (
        <>
          <button
            type="button"
            data-testid="create-inspector-handle"
            onClick={openSettings}
            aria-controls={settingsId}
            aria-expanded={drawerOpen}
            className={`fixed right-0 top-1/2 z-30 hidden min-h-[112px] w-[30px] -translate-y-1/2 items-center justify-center rounded-l-[10px] border border-r-0 border-[var(--border-default)] bg-[var(--bg-elevated)] text-[11.5px] font-medium text-[var(--text-secondary)] shadow-[0_8px_24px_rgb(0_0_0/0.45)] hover:text-[var(--text-primary)] md:flex ${focus}`}
          >
            <span className="[writing-mode:vertical-rl]">{inspectorTitle}</span>
          </button>
          <InspectorDrawer id={settingsId} open={drawerOpen} onClose={closeSettings} title={inspectorTitle}>
            {body}
          </InspectorDrawer>
        </>
      )}
    </div>
  );
}
