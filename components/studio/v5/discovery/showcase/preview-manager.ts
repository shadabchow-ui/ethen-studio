/**
 * Discovery video previews: exactly one plays at a time across the page.
 * Starting a preview stops the previous one; previews are refused under
 * reduced motion and on data-saver / 2G connections (poster only).
 */

let active: { id: string; stop: () => void } | null = null;

export function claimPreview(id: string, stop: () => void): void {
  if (active && active.id !== id) active.stop();
  active = { id, stop };
}

export function releasePreview(id: string): void {
  if (active?.id === id) active = null;
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

export function previewAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g") return false;
  return true;
}
