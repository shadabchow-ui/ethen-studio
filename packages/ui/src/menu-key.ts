/**
 * Shared keyboard contract for statically-open menu surfaces
 * (DropdownMenu, MoreMenu, and future menu primitives).
 *
 * Pure logic — no DOM access — so it can be unit-tested in the node
 * environment (same pattern as `workspace-system/resize-key`).
 *
 * Contract:
 *   - ArrowDown / ArrowUp move focus by one item, wrapping around the list.
 *   - Home / End jump to the first / last enabled item.
 *   - Enter / Space activate the focused item.
 *   - Escape reports a close request; the surface itself is statically
 *     open, so the owning trigger decides whether to honor it.
 *   - Disabled items are skipped during navigation but never focused.
 */

export interface ResolveMenuKeyOptions {
  /** Total number of items in the menu (separators included). */
  count: number;
  /** Predicate returning true for items that cannot be focused/activated. */
  isDisabled?: (index: number) => boolean;
}

export type MenuKeyAction =
  | { type: "move"; index: number }
  | { type: "activate" }
  | { type: "escape" }
  | { type: "none" };

function nextEnabledIndex(
  start: number,
  direction: 1 | -1,
  count: number,
  isDisabled: (index: number) => boolean,
): number {
  if (count <= 0) return -1;
  for (let step = 1; step <= count; step++) {
    const index = (start + direction * step + count) % count;
    if (!isDisabled(index)) return index;
  }
  return -1;
}

export function resolveMenuKey(
  key: string,
  currentIndex: number,
  options: ResolveMenuKeyOptions,
): MenuKeyAction {
  const { count, isDisabled = () => false } = options;

  switch (key) {
    case "ArrowDown":
      return move(1);
    case "ArrowUp":
      return move(-1);
    case "Home":
      return jump(-1, 1);
    case "End":
      return jump(count, -1);
    case "Enter":
    case " ":
      if (currentIndex >= 0 && currentIndex < count && !isDisabled(currentIndex)) {
        return { type: "activate" };
      }
      return { type: "none" };
    case "Escape":
      return { type: "escape" };
    default:
      return { type: "none" };
  }

  function move(direction: 1 | -1): MenuKeyAction {
    const index = nextEnabledIndex(currentIndex, direction, count, isDisabled);
    return index >= 0 ? { type: "move", index } : { type: "none" };
  }

  function jump(from: number, direction: 1 | -1): MenuKeyAction {
    const index = nextEnabledIndex(from, direction, count, isDisabled);
    return index >= 0 ? { type: "move", index } : { type: "none" };
  }
}

/** True when the key participates in the menu keyboard contract. */
export function isMenuKey(key: string): boolean {
  return (
    key === "ArrowDown" ||
    key === "ArrowUp" ||
    key === "Home" ||
    key === "End" ||
    key === "Enter" ||
    key === " " ||
    key === "Escape"
  );
}
