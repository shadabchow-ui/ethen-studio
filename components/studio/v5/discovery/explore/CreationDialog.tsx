"use client";

/**
 * Route-aware overlay for creation detail (intercepted soft navigation).
 * Centred dialog from md, full-screen sheet on phones. Focus moves to the
 * heading on open and is trapped inside; Escape, the backdrop and × close
 * via history (router.back), and focus returns to the invoking tile.
 * The Studio workspace and sidebar are inert while it is open.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreationDetail } from "./CreationDetail";
import { peekInvoker } from "../showcase/return-focus";

const FOCUSABLE = 'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

export function CreationDialog({ creationId }: { creationId: string }) {
  const router = useRouter();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const headingId = React.useId();

  const close = React.useCallback(() => router.back(), [router]);

  React.useEffect(() => {
    const recorded = peekInvoker();
    const active = document.activeElement instanceof HTMLElement && document.activeElement.matches("a[href]") ? document.activeElement : null;
    const background = [
      document.querySelector<HTMLElement>("[data-studio-scroll-root]"),
      document.querySelector<HTMLElement>('[data-testid="studio-sidebar"]'),
    ].filter((node): node is HTMLElement => node !== null);
    for (const node of background) node.setAttribute("inert", "");
    const frame = requestAnimationFrame(() => document.getElementById(headingId)?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      for (const node of background) node.removeAttribute("inert");
      // Restore after the route-focus binding has taken its commit snapshot
      // (it only moves focus to the page heading while focus is unclaimed),
      // to the tile recorded at activation — or its equivalent link when the
      // page underneath re-rendered.
      const href = recorded?.href ?? active?.getAttribute("href") ?? null;
      const label = recorded?.label ?? active?.getAttribute("aria-label") ?? null;
      const restore = (): boolean => {
        let target: HTMLElement | null = !recorded && active?.isConnected ? active : null;
        if (!target && href) {
          target = [...document.querySelectorAll<HTMLElement>(`a[href="${CSS.escape(href)}"]`)].find((node) => node.getAttribute("aria-label") === label) ?? null;
        }
        if (!target) return false;
        target.focus({ preventScroll: true });
        return document.activeElement === target;
      };
      requestAnimationFrame(() => {
        if (!restore()) window.setTimeout(restore, 150);
      });
    };
  }, [close, headingId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center md:items-center md:p-6 lg:p-12">
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={close} className="absolute inset-0 cursor-default bg-[var(--studio-bg-app)]/75 backdrop-blur-[2px]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        data-testid="creation-dialog"
        className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--bg-surface)] md:h-auto md:max-h-[min(90dvh,900px)] md:max-w-[min(1180px,calc(100vw-48px))] md:rounded-[18px] md:border md:border-[var(--border-default)] md:shadow-[0_24px_80px_color-mix(in_srgb,var(--studio-primary-fg)_70%,transparent)] lg:h-[min(86dvh,860px)]"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close creation"
          className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--bg-elevated)] text-[var(--text-secondary)] outline-none hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <CreationDetail creationId={creationId} mode="dialog" headingId={headingId} />
      </div>
    </div>
  );
}
