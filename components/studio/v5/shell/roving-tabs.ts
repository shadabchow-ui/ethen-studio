/**
 * RC8 — roving-tabindex target for WAI-ARIA tablists (pure, node-testable).
 *
 * Arrow keys move focus among the focusable tabs with wrap-around; Home/End
 * jump to the ends. Returns null for any other key. Activation stays manual
 * (Enter/Space on the focused tab) so Link-based tabs keep native
 * navigation and never fire from arrowing.
 */
export function rovingTabTarget(
  ids: readonly string[],
  currentId: string,
  key: string,
): string | null {
  if (ids.length === 0) return null;
  const found = ids.indexOf(currentId);
  const at = found === -1 ? 0 : found;
  switch (key) {
    case "ArrowRight":
      return ids[(at + 1) % ids.length] ?? null;
    case "ArrowLeft":
      return ids[(at - 1 + ids.length) % ids.length] ?? null;
    case "Home":
      return ids[0] ?? null;
    case "End":
      return ids[ids.length - 1] ?? null;
    default:
      return null;
  }
}
