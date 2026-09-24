"use client";

import { useMemo } from "react";
import { showcaseFeed, type StudioShowcaseItem } from "../../../../../lib/studio-v5/showcase-feed";

/** The discovery feed: final media first, placeholder slots after. */
export function useShowcaseFeed(): { items: readonly StudioShowcaseItem[] } {
  const items = useMemo(() => showcaseFeed(), []);
  return { items };
}
