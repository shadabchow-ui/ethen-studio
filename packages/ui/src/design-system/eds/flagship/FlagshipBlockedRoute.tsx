"use client";

/**
 * D15-J03 — shared blocked-route card.
 *
 * Consumed by every flagship that can refuse a route. Binds the J02
 * access state (`BLOCKED_ROUTE` → `capability_disabled`) to the EDS state
 * vocabulary: the third clause carries the F-01 approved copy verbatim —
 * "Nothing was started. Your task and selected context are unchanged."
 * Recovery names outcomes, never mechanisms.
 */
import * as React from "react";
import {
  BLOCKED_ROUTE_CODE,
  resolveAccessState,
} from "@ethen/contracts/platform/access-state";
import { StateSurface } from "../states/StateSurface";

export interface FlagshipBlockedRouteProps {
  productLabel: string;
  /** Why this route refused — the registry's own disabled reason. */
  reason: string;
  onChooseAnother: () => void;
  onChangeTask: () => void;
  title?: string;
  id?: string;
}

export function FlagshipBlockedRoute({
  productLabel,
  reason,
  onChooseAnother,
  onChangeTask,
  title,
  id,
}: FlagshipBlockedRouteProps) {
  const unchanged = React.useMemo(
    () =>
      resolveAccessState({ code: BLOCKED_ROUTE_CODE, status: 403 }).description,
    [],
  );
  return (
    <section aria-label="Blocked route">
      <StateSurface
        kind="blocked"
        label="Blocked route"
        title={title ?? `I can't route this to ${productLabel} in this workspace.`}
        body={reason}
        unchanged={unchanged}
        actions={[
          { label: "Choose another product", onAction: onChooseAnother },
          { label: "Change the task", onAction: onChangeTask },
        ]}
        id={id}
      />
    </section>
  );
}
