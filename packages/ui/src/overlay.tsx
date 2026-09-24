"use client";

import * as React from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export function useOverlay(open: boolean, onClose: () => void, options: { initialFocus?: React.RefObject<HTMLElement | null>; closeOnBackdrop?: boolean } = {}) {
  const { initialFocus, closeOnBackdrop = true } = options;
  const ref = React.useRef<HTMLDivElement>(null);
  const previous = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !ref.current) return;
      const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => node.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    (initialFocus?.current ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previous.current?.isConnected) previous.current.focus();
    };
  }, [open, initialFocus]);

  return { ref, onBackdropMouseDown: (event: React.MouseEvent) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); } };
}

