/**
 * Creation-detail focus return. Route-focus moves focus to the page heading
 * as soon as a navigation starts, before the overlay mounts, so the tile
 * records itself at activation time; the overlay restores to it (or to the
 * equivalent link if the page re-rendered) on close.
 */

let last: { href: string; label: string | null } | null = null;

export function rememberInvoker(element: HTMLElement): void {
  const href = element.getAttribute("href");
  if (href) last = { href, label: element.getAttribute("aria-label") };
}

/** Non-consuming read: dev strict mode runs the overlay effect twice. */
export function peekInvoker(): { href: string; label: string | null } | null {
  return last;
}
