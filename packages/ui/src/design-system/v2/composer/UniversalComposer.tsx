"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import styles from "./UniversalComposer.module.css";

export type UniversalComposerState = "idle" | "sending" | "error" | "disabled";
export type UniversalComposerVoiceState = "idle" | "recording" | "uploading" | "transcribing" | "complete" | "error" | "permission-denied" | "unsupported";
export type UniversalComposerAttachmentKind = "file" | "image" | "document";

export interface UniversalComposerOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string | null;
}

export interface UniversalComposerModel extends UniversalComposerOption {
  provider?: string;
  /**
   * Public path to a canonical provider logo. Callers resolve this from the
   * repository's confirmed asset map and pass `undefined` when no official
   * artwork exists — this component never substitutes an invented mark.
   */
  providerLogoSrc?: string;
}

export interface UniversalComposerAttachment {
  id: string;
  name: string;
  detail?: string;
}

/**
 * A flagship product the composer can open.
 *
 * This is navigation, not routing: choosing a launcher opens that product's
 * own page. It is deliberately a different concept from `destinations`, which
 * route the current message, and the two are never shown side by side.
 */
export interface UniversalComposerLauncher {
  id: string;
  label: string;
  href: string;
  description?: string;
  /** Current surface — rendered as selected and never navigated away to. */
  current?: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
}

export interface UniversalComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  models: readonly UniversalComposerModel[];
  selectedModelId?: string | null;
  onModelSelect?: (id: string) => void;
  destinations?: readonly UniversalComposerOption[];
  selectedDestinationId?: string | null;
  destinationLabel?: string;
  onDestinationSelect?: (id: string) => void;
  /** Flagship products to open. Replaces the destination chip when supplied. */
  launchers?: readonly UniversalComposerLauncher[];
  launcherLabel?: string;
  /** Called with the chosen launcher so the host can navigate. */
  onLauncherSelect?: (launcher: UniversalComposerLauncher) => void;
  /**
   * Execution mode and approval policy are developer-facing controls whose
   * meaning depends on the destination runtime. Surfaces that cannot explain
   * them simply pass `false` and get automatic behaviour; the runtime values
   * themselves are untouched.
   */
  showExecutionControls?: boolean;
  executionMode?: "interactive" | "asynchronous";
  approvalPolicy?: "automatic" | "prompt";
  onExecutionModeChange?: (value: "interactive" | "asynchronous") => void;
  onApprovalPolicyChange?: (value: "automatic" | "prompt") => void;
  attachments?: readonly UniversalComposerAttachment[];
  onAttachmentRequest?: (kind: UniversalComposerAttachmentKind) => void;
  onAttachmentRemove?: (attachment: UniversalComposerAttachment) => void;
  tools?: readonly UniversalComposerOption[];
  selectedToolIds?: readonly string[];
  onToolToggle?: (id: string) => void;
  projects?: readonly UniversalComposerOption[];
  selectedProjectId?: string | null;
  onProjectSelect?: (id: string) => void;
  onVoiceClick?: () => void;
  voiceState?: UniversalComposerVoiceState;
  voiceError?: string | null;
  state?: UniversalComposerState;
  error?: string | null;
  placeholder?: string;
  className?: string;
  theme?: "dark" | "light";
}

type Panel = "add" | "model" | "destination" | "launcher" | "mode" | "tools" | "project" | "more" | null;

const COMPACT_BREAKPOINT = 430;
const MAX_EDITOR_HEIGHT = 200;
const MODEL_PICKER_MAX_HEIGHT = 520;
const VIEWPORT_COLLISION_PADDING = 16;
const MENU_GAP = 8;

function Icon({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={styles.icon}>{children}</svg>;
}

function Caret() {
  return <svg aria-hidden="true" viewBox="0 0 8 5" fill="none" className={styles.caret}><path d="m1 1 3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>;
}

function panelLabel(panel: Panel): string {
  if (panel === "model") return "Choose a model";
  if (panel === "destination") return "Choose a destination";
  if (panel === "launcher") return "Open a product";
  if (panel === "mode") return "Execution and approval";
  if (panel === "tools") return "Tools";
  if (panel === "project") return "Project";
  if (panel === "more") return "More controls";
  return "Add";
}

export function UniversalComposer({
  value,
  onValueChange,
  onSubmit,
  models,
  selectedModelId,
  onModelSelect,
  destinations = [],
  selectedDestinationId,
  destinationLabel,
  onDestinationSelect,
  launchers = [],
  launcherLabel = "Apps",
  onLauncherSelect,
  showExecutionControls = true,
  executionMode = "interactive",
  approvalPolicy = "automatic",
  onExecutionModeChange,
  onApprovalPolicyChange,
  attachments = [],
  onAttachmentRequest,
  onAttachmentRemove,
  tools = [],
  selectedToolIds = [],
  onToolToggle,
  projects = [],
  selectedProjectId,
  onProjectSelect,
  onVoiceClick,
  voiceState = "idle",
  voiceError,
  state = "idle",
  error,
  placeholder = "Message Ethen",
  className,
  theme = "dark",
}: UniversalComposerProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRefs = useRef<Partial<Record<Exclude<Panel, null>, HTMLButtonElement>>>({});
  const returnFocusRef = useRef<Exclude<Panel, null> | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [compact, setCompact] = useState(false);
  const [menuLeft, setMenuLeft] = useState(6);
  const [menuWidth, setMenuWidth] = useState(248);
  const [menuPlacement, setMenuPlacement] = useState<"above" | "below">("below");
  const [menuMaxHeight, setMenuMaxHeight] = useState(MODEL_PICKER_MAX_HEIGHT);

  const disabled = state === "disabled" || state === "sending";
  const canSubmit = value.trim().length > 0 && !disabled;
  const selectedModel = models.find((model) => model.id === selectedModelId);
  const selectedDestination = destinations.find((item) => item.id === selectedDestinationId);
  const modeLabel = executionMode === "asynchronous" ? "Async" : "Ask";
  /* One control per concept: a surface that can launch products does not also
   * show a near-identical destination chip. */
  const useLauncher = launchers.length > 0;
  const modelRows = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    return models.filter((model) => !query || [model.label, model.provider, model.description].filter(Boolean).some((part) => part?.toLowerCase().includes(query)));
  }, [modelQuery, models]);

  /* Provider is the top level of the model picker and the model is the second.
   * Grouping keeps that hierarchy visible instead of presenting one long
   * alphabetical list where the provider is buried in a metadata line.
   * Providers appear in the order the catalog first mentions them — the
   * catalog's ordering is preserved, never re-ranked here. */
  const modelGroups = useMemo(() => {
    const groups: { provider: string; logoSrc?: string; models: UniversalComposerModel[] }[] = [];
    const index = new Map<string, number>();
    for (const model of modelRows) {
      const provider = model.provider?.trim() || "Other";
      const at = index.get(provider);
      if (at === undefined) {
        index.set(provider, groups.length);
        groups.push({ provider, logoSrc: model.providerLogoSrc, models: [model] });
      } else {
        groups[at].models.push(model);
        groups[at].logoSrc ??= model.providerLogoSrc;
      }
    }
    /* The provider of the current selection leads, so opening the picker
     * always starts at the model in use rather than at whichever provider the
     * catalog happens to list first. Every other group keeps catalog order. */
    const selectedProvider = models.find((model) => model.id === selectedModelId)?.provider?.trim() || null;
    if (selectedProvider) {
      const at = groups.findIndex((group) => group.provider === selectedProvider);
      if (at > 0) groups.unshift(...groups.splice(at, 1));
    }
    return groups;
  }, [modelRows, models, selectedModelId]);

  const autosize = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || editor.offsetWidth === 0) return;
    editor.style.height = "auto";
    editor.style.height = `${Math.min(MAX_EDITOR_HEIGHT, editor.scrollHeight)}px`;
  }, []);

  const anchorPanel = useCallback(() => {
    if (!panel || !rootRef.current) return;
    const root = rootRef.current;
    const target = triggerRefs.current[panel] ?? triggerRefs.current.more;
    const rootBounds = root.getBoundingClientRect();
    const preferred = panel === "model" ? 330 : panel === "launcher" ? 300 : panel === "mode" ? 276 : panel === "add" ? 220 : 244;
    const viewportWidth = Math.max(0, window.innerWidth - VIEWPORT_COLLISION_PADDING * 2);
    const width = Math.min(preferred, Math.max(180, Math.min(root.clientWidth - 12, viewportWidth)));
    setMenuWidth(width);
    const targetLeft = target ? target.getBoundingClientRect().left - rootBounds.left : 6;
    const minimumLeft = VIEWPORT_COLLISION_PADDING - rootBounds.left;
    const maximumLeft = window.innerWidth - VIEWPORT_COLLISION_PADDING - rootBounds.left - width;
    setMenuLeft(Math.max(minimumLeft, Math.min(targetLeft, maximumLeft)));

    const availableAbove = Math.max(0, rootBounds.top - VIEWPORT_COLLISION_PADDING - MENU_GAP);
    const availableBelow = Math.max(0, window.innerHeight - rootBounds.bottom - VIEWPORT_COLLISION_PADDING - MENU_GAP);
    const preferredHeight = Math.min(MODEL_PICKER_MAX_HEIGHT, menuRef.current?.scrollHeight ?? (panel === "model" ? MODEL_PICKER_MAX_HEIGHT : 340));
    const placement = availableBelow >= preferredHeight
      ? "below"
      : availableAbove >= preferredHeight
        ? "above"
        : availableBelow >= availableAbove
          ? "below"
          : "above";
    setMenuPlacement(placement);
    setMenuMaxHeight(Math.min(preferredHeight, placement === "above" ? availableAbove : availableBelow));
  }, [panel]);

  useLayoutEffect(() => {
    autosize();
  }, [autosize, value]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? root.clientWidth;
      if (width > 0) setCompact(width < COMPACT_BREAKPOINT);
      autosize();
      anchorPanel();
    });
    observer.observe(root);
    const modelTrigger = triggerRefs.current.model;
    if (modelTrigger) observer.observe(modelTrigger);
    return () => observer.disconnect();
  }, [anchorPanel, autosize]);

  useLayoutEffect(() => {
    anchorPanel();
  }, [anchorPanel, compact]);

  const closePanel = useCallback((restore = true) => {
    const returnTo = returnFocusRef.current;
    setPanel(null);
    setModelQuery("");
    returnFocusRef.current = null;
    if (restore && returnTo) requestAnimationFrame(() => triggerRefs.current[returnTo]?.focus());
  }, []);

  const openPanel = useCallback((next: Exclude<Panel, null>, returnTo: Exclude<Panel, null> = next) => {
    if (disabled) return;
    if (panel === next) {
      closePanel();
      return;
    }
    returnFocusRef.current = returnTo;
    setModelQuery("");
    setPanel(next);
  }, [closePanel, disabled, panel]);

  useEffect(() => {
    if (!panel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) closePanel(false);
    };
    const onWindowResize = () => anchorPanel();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onWindowResize);
    window.visualViewport?.addEventListener("resize", onWindowResize);
    const focusTimer = window.setTimeout(() => {
      if (panel === "model") searchRef.current?.focus();
      else menuRef.current?.querySelector<HTMLElement>("[data-uc-menu-item]:not(:disabled)")?.focus();
    });
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onWindowResize);
      window.visualViewport?.removeEventListener("resize", onWindowResize);
    };
  }, [anchorPanel, closePanel, panel]);

  /* Anchors as well as buttons: launcher rows are real links so they can be
   * opened in a new tab, and roving focus has to reach them too. */
  const menuButtons = useCallback(
    () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[data-uc-menu-item]:not(:disabled)") ?? []),
    [],
  );

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }
    const buttons = menuButtons();
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLElement);
    const focus = (index: number) => buttons[(index + buttons.length) % buttons.length]?.focus();
    if (event.key === "ArrowDown") { event.preventDefault(); focus(current + 1); }
    if (event.key === "ArrowUp") { event.preventDefault(); focus(current <= 0 ? buttons.length - 1 : current - 1); }
    if (event.key === "Home") { event.preventDefault(); buttons[0]?.focus(); }
    if (event.key === "End") { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
  };

  const choose = (callback?: () => void) => {
    callback?.();
    closePanel();
  };

  const submit = () => {
    if (canSubmit) onSubmit();
  };

  const renderOption = (option: UniversalComposerOption, selected: boolean, onClick: () => void, mark?: ReactNode) => (
    <button
      key={option.id}
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      disabled={option.disabled}
      title={option.disabledReason ?? undefined}
      data-uc-menu-item
      data-selected={selected || undefined}
      className={styles.menuItem}
      onClick={onClick}
    >
      {mark ?? null}
      <span className={styles.menuItemCopy}><span className={styles.menuItemLabel}>{option.label}</span>{option.description ? <span className={styles.menuItemDescription}>{option.description}</span> : null}</span>
      {selected ? <span className={styles.check} aria-hidden="true">✓</span> : null}
    </button>
  );

  const renderPanel = () => {
    if (!panel) return null;
    const isModel = panel === "model";
    const panelStyle: CSSProperties = {
      left: menuLeft,
      width: menuWidth,
      maxHeight: menuMaxHeight,
    };
    return (
      <div
        ref={menuRef}
        className={isModel ? `${styles.menu} ${styles.modelMenu}` : styles.menu}
        style={panelStyle}
        data-placement={menuPlacement}
        role={isModel ? "dialog" : "menu"}
        aria-label={panelLabel(panel)}
        onKeyDown={onMenuKeyDown}
      >
        {panel === "model" ? <div className={styles.search}><Icon><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.2" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></Icon><input ref={searchRef} value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); menuButtons()[0]?.focus(); } }} placeholder="Search models" aria-label="Search models" /></div> : null}
        {panel === "add" ? <>
          {onAttachmentRequest ? <>
          <button type="button" data-uc-menu-item className={styles.menuItem} onClick={() => choose(() => onAttachmentRequest?.("file"))}><span className={styles.menuItemLabel}>Upload file</span></button>
          <button type="button" data-uc-menu-item className={styles.menuItem} onClick={() => choose(() => onAttachmentRequest?.("image"))}><span className={styles.menuItemLabel}>Upload image</span></button>
          <button type="button" data-uc-menu-item className={styles.menuItem} onClick={() => choose(() => onAttachmentRequest?.("document"))}><span className={styles.menuItemLabel}>Attach document</span></button>
          </> : null}
          <button type="button" data-uc-menu-item className={styles.menuItem} disabled={!tools.length} onClick={() => openPanel("tools", "add")}><span className={styles.menuItemLabel}>Tools</span></button>
          <button type="button" data-uc-menu-item className={styles.menuItem} disabled={!projects.length} onClick={() => openPanel("project", "add")}><span className={styles.menuItemLabel}>Project</span></button>
        </> : null}
        {panel === "model" ? <div className={styles.modelList} role="listbox" aria-label="Models">{modelGroups.length ? modelGroups.map((group) => (
          <div key={group.provider} role="group" aria-label={group.provider}>
            <p className={styles.providerHeading}>
              {group.logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={group.logoSrc} alt="" aria-hidden="true" className={styles.providerMark} />
              ) : null}
              <span>{group.provider}</span>
            </p>
            {group.models.map((model) => renderOption(model, model.id === selectedModelId, () => choose(() => onModelSelect?.(model.id))))}
          </div>
        )) : <p className={styles.empty}>No models match “{modelQuery.trim()}”</p>}</div> : null}
        {panel === "destination" ? <div role="listbox" aria-label="Destinations">{[...destinations].map((option) => renderOption(option, option.id === selectedDestinationId, () => choose(() => onDestinationSelect?.(option.id))))}</div> : null}
        {panel === "launcher" ? <div role="menu" aria-label="Products">{launchers.map((launcher) => launcher.disabled ? (
          <button
            key={launcher.id}
            type="button"
            role="menuitem"
            disabled
            aria-disabled="true"
            title={launcher.disabledReason ?? undefined}
            className={styles.menuItem}
          >
            <span className={styles.menuItemCopy}><span className={styles.menuItemLabel}>{launcher.label}</span><span className={styles.menuItemDescription}>{launcher.disabledReason ?? launcher.description}</span></span>
          </button>
        ) : (
          <a
            key={launcher.id}
            href={launcher.href}
            role="menuitem"
            data-uc-menu-item
            data-selected={launcher.current || undefined}
            aria-current={launcher.current ? "page" : undefined}
            className={styles.menuItem}
            onKeyDown={(event) => { if (event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
            onClick={(event) => {
              /* Modified clicks stay native so a product can be opened in a
               * new tab; a plain click is handed to the host router. */
              if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              if (!onLauncherSelect) return;
              event.preventDefault();
              choose(() => onLauncherSelect(launcher));
            }}
          >
            <span className={styles.menuItemCopy}><span className={styles.menuItemLabel}>{launcher.label}</span>{launcher.description ? <span className={styles.menuItemDescription}>{launcher.description}</span> : null}</span>
            {launcher.current ? <span className={styles.check} aria-hidden="true">✓</span> : null}
          </a>
        ))}</div> : null}
        {panel === "tools" ? <div role="menu" aria-label="Tools">{tools.map((option) => renderOption(option, selectedToolIds.includes(option.id), () => onToolToggle?.(option.id)))}</div> : null}
        {panel === "project" ? <div role="listbox" aria-label="Projects">{projects.map((option) => renderOption(option, option.id === selectedProjectId, () => choose(() => onProjectSelect?.(option.id))))}</div> : null}
        {panel === "more" ? <>
          {useLauncher
            ? <button type="button" data-uc-menu-item className={styles.menuItem} onClick={() => openPanel("launcher", "more")}><span className={styles.menuItemLabel}>{launcherLabel}</span><span className={styles.menuItemDescription}>Open a product</span></button>
            : <button type="button" data-uc-menu-item className={styles.menuItem} onClick={() => openPanel("destination", "more")}><span className={styles.menuItemLabel}>Destination</span><span className={styles.menuItemDescription}>{selectedDestination?.label ?? destinationLabel ?? "Auto"}</span></button>}
          {showExecutionControls ? <button type="button" data-uc-menu-item className={styles.menuItem} onClick={() => openPanel("mode", "more")}><span className={styles.menuItemLabel}>Mode</span><span className={styles.menuItemDescription}>{modeLabel}</span></button> : null}
        </> : null}
        {panel === "mode" && showExecutionControls ? <div className={styles.modePanel}>
          <p className={styles.menuHeading}>Execution</p>
          <button type="button" data-uc-menu-item className={styles.menuItem} data-selected={executionMode === "interactive" || undefined} onClick={() => choose(() => onExecutionModeChange?.("interactive"))}><span className={styles.menuItemCopy}><span className={styles.menuItemLabel}>Interactive</span><span className={styles.menuItemDescription}>Ask</span></span>{executionMode === "interactive" ? <span className={styles.check}>✓</span> : null}</button>
          <button type="button" data-uc-menu-item className={styles.menuItem} data-selected={executionMode === "asynchronous" || undefined} onClick={() => choose(() => onExecutionModeChange?.("asynchronous"))}><span className={styles.menuItemCopy}><span className={styles.menuItemLabel}>Asynchronous</span><span className={styles.menuItemDescription}>Async</span></span>{executionMode === "asynchronous" ? <span className={styles.check}>✓</span> : null}</button>
          <p className={styles.menuHeading}>Approval</p>
          <button type="button" data-uc-menu-item className={styles.menuItem} data-selected={approvalPolicy === "automatic" || undefined} onClick={() => choose(() => onApprovalPolicyChange?.("automatic"))}><span className={styles.menuItemLabel}>Automatic</span>{approvalPolicy === "automatic" ? <span className={styles.check}>✓</span> : null}</button>
          <button type="button" data-uc-menu-item className={styles.menuItem} data-selected={approvalPolicy === "prompt" || undefined} onClick={() => choose(() => onApprovalPolicyChange?.("prompt"))}><span className={styles.menuItemCopy}><span className={styles.menuItemLabel}>Prompt</span><span className={styles.menuItemDescription}>Before destructive actions</span></span>{approvalPolicy === "prompt" ? <span className={styles.check}>✓</span> : null}</button>
        </div> : null}
      </div>
    );
  };

  return (
    <div ref={rootRef} className={className ? `${styles.root} ${className}` : styles.root} data-theme={theme} data-compact={compact || undefined}>
      {/* renderPanel only passes menuRef to the popup DOM node; it does not read it during render. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {renderPanel()}
      <form className={styles.surface} onSubmit={(event) => { event.preventDefault(); submit(); }} aria-busy={state === "sending" || undefined}>
        {attachments.length ? <ul className={styles.attachments} aria-label="Attachments">{attachments.map((attachment) => <li key={attachment.id} className={styles.attachment}><span title={attachment.name}>{attachment.name}{attachment.detail ? ` · ${attachment.detail}` : ""}</span><button type="button" disabled={disabled} tabIndex={disabled ? -1 : undefined} onClick={() => onAttachmentRemove?.(attachment)} aria-label={`Remove ${attachment.name}`}>×</button></li>)}</ul> : null}
        <div className={styles.editorWrap}><label className="sr-only" htmlFor={id}>Message Ethen</label><textarea ref={editorRef} id={id} rows={1} value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onValueChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} /></div>
        <div className={styles.toolbar}>
          <button ref={(node) => { triggerRefs.current.add = node ?? undefined; }} type="button" className={`${styles.iconButton} ${styles.addButton}`} aria-label="Add" aria-haspopup="menu" aria-expanded={panel === "add"} disabled={disabled} onClick={() => openPanel("add")}><Icon><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></Icon></button>
          <button ref={(node) => { triggerRefs.current.model = node ?? undefined; }} type="button" className={styles.chip} data-uc-flexible="true" aria-haspopup="dialog" aria-expanded={panel === "model"} disabled={disabled || !models.length} onClick={() => openPanel("model")}><span>{selectedModel?.label ?? "Model"}</span><Caret /></button>
          {!compact ? <>
            {useLauncher
              ? <button ref={(node) => { triggerRefs.current.launcher = node ?? undefined; }} type="button" className={styles.chip} aria-haspopup="menu" aria-expanded={panel === "launcher"} disabled={disabled} onClick={() => openPanel("launcher")}><span>{launcherLabel}</span><Caret /></button>
              : <button ref={(node) => { triggerRefs.current.destination = node ?? undefined; }} type="button" className={styles.chip} aria-haspopup="menu" aria-expanded={panel === "destination"} disabled={disabled || !destinations.length} onClick={() => openPanel("destination")}><span>{selectedDestination?.label ?? destinationLabel ?? "Auto"}</span><Caret /></button>}
            {showExecutionControls ? <button ref={(node) => { triggerRefs.current.mode = node ?? undefined; }} type="button" className={styles.chip} aria-haspopup="menu" aria-expanded={panel === "mode"} disabled={disabled} onClick={() => openPanel("mode")}><span>{modeLabel}</span><Caret /></button> : null}
          </> : <button ref={(node) => { triggerRefs.current.more = node ?? undefined; }} type="button" className={styles.chip} aria-haspopup="menu" aria-expanded={panel === "more"} disabled={disabled} onClick={() => openPanel("more")} aria-label="More controls">···</button>}
          <span className={styles.spacer} />
          <button type="button" className={styles.iconButton} aria-label={voiceState === "unsupported" ? "Voice input unavailable" : voiceState === "recording" ? "Stop voice input" : voiceState === "uploading" || voiceState === "transcribing" ? "Transcribing voice input" : "Use voice input"} disabled={disabled || voiceState === "unsupported" || voiceState === "uploading" || voiceState === "transcribing"} onClick={onVoiceClick} data-active={voiceState === "recording" || undefined}><Icon>{voiceState === "uploading" || voiceState === "transcribing" ? <circle className={styles.voiceSpinner} cx="8" cy="8" r="5" /> : voiceState === "recording" ? <><path d="M6 3v7a2 2 0 0 0 4 0V3a2 2 0 0 0-4 0Z" fill="currentColor" /><path d="M4 8a4 4 0 0 0 8 0M8 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></> : <><rect x="6" y="2" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.3" /><path d="M4 8a4 4 0 0 0 8 0M8 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></>}</Icon></button>
          <button type="submit" className={styles.sendButton} data-ready={canSubmit || undefined} disabled={!canSubmit} aria-label={state === "sending" ? "Sending message" : "Send message"}>{state === "sending" ? <span className={styles.spinner} /> : <Icon><path d="M8 13V3M4 7l4-4 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></Icon>}</button>
        </div>
      </form>
      {voiceState === "recording" ? <p className={styles.status} role="status">Listening…</p> : null}
      {voiceState === "uploading" ? <p className={styles.status} role="status">Uploading audio…</p> : null}
      {voiceState === "transcribing" ? <p className={styles.status} role="status">Transcribing…</p> : null}
      {voiceState === "permission-denied" ? <p className={styles.error} role="alert">Microphone permission was denied.</p> : null}
      {voiceState === "unsupported" ? <p className={styles.status} role="status">Voice input is not supported in this browser.</p> : null}
      {voiceState === "error" && voiceError ? <p className={styles.error} role="alert">{voiceError}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
  );
}
