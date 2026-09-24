"use client";

import Link from "next/link";
import { formatIcuDollars } from "../create/create-api-client";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";
import { useCreditBalance } from "./use-credit-balance";

/**
 * M6A D3 — sidebar credit meter. Shows the measured balance for the
 * active project, "Setup required" when balances are unavailable, and
 * "Unknown" while loading or on error. Never renders a fabricated 0;
 * links to Billing & Usage settings.
 */
export function StudioCreditMeter({ projectId }: { projectId: string | null }) {
  const balance = useCreditBalance(projectId);
  return (
    <Link
      href="/studio/settings?section=plan"
      aria-label={
        balance.state === "ready" && balance.balanceIcu !== null
          ? `Credit balance ${formatIcuDollars(balance.balanceIcu)}. Open Billing and Usage settings.`
          : "Credit balance unavailable. Open Billing and Usage settings."
      }
      className={`flex min-h-[40px] items-center gap-2.5 rounded-[8px] px-3 text-left transition-colors duration-150 hover:bg-[var(--bg-elevated)] ${STUDIO_FOCUS_RING_CLASS}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${balance.state === "ready" ? "bg-[var(--studio-accent)]" : "bg-[var(--text-tertiary)]"}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-[var(--text-primary)]">
          {balance.state === "ready" && balance.balanceIcu !== null
            ? formatIcuDollars(balance.balanceIcu)
            : balance.state === "loading"
              ? "Unknown"
              : balance.state === "setup_required"
                ? "Setup required"
                : "Unknown"}
        </span>
        <span className="block truncate text-[11px] text-[var(--text-tertiary)]">Credits · Billing &amp; Usage</span>
      </span>
    </Link>
  );
}
