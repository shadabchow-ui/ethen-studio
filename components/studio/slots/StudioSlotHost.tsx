"use client";

import { useEffect, useState } from "react";
import {
  missingStudioWorkspaceSlots,
  resolveStudioWorkspaceSlot,
  type StudioWorkspaceSlotKey,
  type StudioWorkspaceSlots,
} from "@ethen/app-shell";
import "./boot";
import { SlotEmpty, SlotLoading } from "./slot-primitives";

/**
 * Studio V2 Job 13 — slot host.
 *
 * Resolves a registered Studio slot after client mount. The mount gate
 * keeps server and first-client renders identical (a loading state), so
 * slot registration — which runs in the client bundle — can never cause
 * a hydration mismatch. Unregistered slots render an honest empty state,
 * never a fake panel.
 */

type SlotProps<Key extends StudioWorkspaceSlotKey> = React.ComponentProps<StudioWorkspaceSlots[Key]>;

export function StudioSlotHost<Key extends StudioWorkspaceSlotKey>({
  slot,
  ...props
}: { slot: Key } & SlotProps<Key>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- M7A: mount flag; single intentional post-hydration flip from the SSR snapshot.
    setMounted(true);
  }, []);
  if (!mounted) {
    return <SlotLoading label="Loading workspace…" />;
  }
  if (missingStudioWorkspaceSlots().includes(slot)) {
    return <SlotEmpty title="Panel unavailable" hint="This workspace panel has no Studio implementation." />;
  }
  const Slot = resolveStudioWorkspaceSlot(slot);
  const Typed = Slot as unknown as React.ComponentType<Record<string, unknown>>;
  return <Typed {...(props as Record<string, unknown>)} />;
}
