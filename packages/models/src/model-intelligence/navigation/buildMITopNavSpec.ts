/**
 * lib/model-intelligence/navigation/buildMITopNavSpec.ts
 * Build a MITopNavSpec from the MI_NAV_GROUPS taxonomy.
 * Server-safe — no client imports.
 */
import type { MITopNavSpec, MIDropdownGroup } from "../modelIntelligenceTypes";
import { MI_NAV_GROUPS } from "./modelIntelligenceNav";

/**
 * Build dropdown groups from the MI_NAV_GROUPS taxonomy.
 */
export function buildDropdownGroups(currentPath?: string): MIDropdownGroup[] {
  const groups: MIDropdownGroup[] = [];

  for (const navGroup of MI_NAV_GROUPS) {
    const items = navGroup.items.map((item) => ({
      label: item.label,
      href: item.href,
      description: item.description,
      badge: item.badge,
      disabled: item.badge === "soon" || !item.href || item.href === "#",
      active: currentPath ? item.href === currentPath : false,
    }));

    groups.push({
      label: navGroup.label,
      description: navGroup.description,
      items,
    });
  }

  return groups;
}

/**
 * Build a full MITopNavSpec for the Model Intelligence section.
 * Uses dropdown groups only — no flat nav links to avoid duplicate behavior.
 */
export function buildMITopNavSpec(
  currentPath?: string,
): MITopNavSpec {
  return {
    brandLabel: "Upcube",
    brandHref: "/",
    links: [],
    dropdownGroups: buildDropdownGroups(currentPath),
  };
}
