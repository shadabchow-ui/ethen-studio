"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudioReviewPanelSlotProps } from "@ethen/app-shell";
import { ApprovalCard } from "@ethen/ui/approval-card";
import { toApprovalCardProps, type CanonicalStudioApproval } from "@/lib/media/review-shell-wiring";
import { useStudioWorkbenchSelectionOptional } from "./selection-context";
import {
  SlotEmpty,
  SlotLoading,
  SlotPanel,
  fetchSlotJson,
  type SlotFetchState,
} from "./slot-primitives";

/**
 * Studio V2 Job 13 — ReviewPanel slot implementation.
 *
 * Token-gated review resolution through `/api/media/reviews/[token]` (the
 * route is the authority: expiry, revocation, withdrawn consent, and
 * removed assets deny with explicit reasons). Bound approvals render via
 * the shared `ApprovalCard` through `toApprovalCardProps`: only pending,
 * unexpired approvals offer verdict actions, and the backend decides on
 * submit. The UI is never the authority.
 */

interface ReviewAsset {
  assetId: string;
  title: string;
  kind: string;
  contentHash: string | null;
  signedUrl: string | null;
}

interface ReviewData {
  assets: ReviewAsset[];
  note: string;
}

export function StudioReviewPanelSlot({ reviewToken, onVerdict }: StudioReviewPanelSlotProps) {
  const selection = useStudioWorkbenchSelectionOptional();
  const [fetchState, setFetchState] = useState<SlotFetchState<ReviewData>>({ state: "loading" });
  const [denial, setDenial] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!reviewToken) {
      setFetchState({ state: "empty" });
      setDenial(null);
      return;
    }
    setFetchState({ state: "loading" });
    setDenial(null);
    void fetchSlotJson(`/api/media/reviews/${encodeURIComponent(reviewToken)}`)
      .then(({ body }) => {
        const record = body as { ok?: boolean; data?: { assets?: ReviewAsset[]; note?: string }; error?: unknown } | null;
        if (record?.ok && Array.isArray(record.data?.assets)) {
          setFetchState({
            state: "ready",
            data: {
              assets: record.data.assets as ReviewAsset[],
              note: typeof record.data.note === "string" ? record.data.note : "",
            },
          });
          return;
        }
        const reason =
          typeof record?.error === "string" ? record.error : "This review link is not available.";
        setDenial(reason);
        setFetchState({ state: "empty" });
      })
      .catch(() => {
        setDenial("This review link is not available.");
        setFetchState({ state: "empty" });
      });
  }, [reviewToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- M7A: async loader on scope change; all setState calls settle in fetch continuations.
    load();
  }, [load]);

  const approval = selection?.approval ?? null;
  const cardProps = useMemo(() => {
    if (!approval) return null;
    const record: CanonicalStudioApproval = {
      id: approval.id,
      title: approval.title,
      description: approval.description,
      riskCategories: approval.riskCategories,
      action: approval.action,
      resource: approval.resource,
      affectedEntities: approval.affectedEntities,
      lifecycle: approval.lifecycle as CanonicalStudioApproval["lifecycle"],
      expiresAt: approval.expiresAt,
      consumedAt: approval.consumedAt,
      promptHash: approval.promptHash,
    };
    return toApprovalCardProps(record);
  }, [approval]);

  const actionable = cardProps?.status === "pending" && onVerdict !== undefined;

  return (
    <SlotPanel label="Studio review">
      {fetchState.state === "loading" && reviewToken ? <SlotLoading label="Resolving review link…" /> : null}
      {denial ? (
        <div role="alert" className="rounded-[12px] bg-[var(--bg-surface)] px-4 py-6 text-center">
          <p className="text-[12.5px] text-[var(--text-secondary)]">{denial}</p>
          <p className="mt-1 text-[11.5px] text-[var(--text-tertiary)]">Expired, revoked, or withdrawn shares deny explicitly — never silently.</p>
        </div>
      ) : null}
      {fetchState.state === "ready" ? (
        <div className="space-y-3">
          {fetchState.data.note ? <p className="text-[12.5px] text-[var(--text-secondary)]">{fetchState.data.note}</p> : null}
          {fetchState.data.assets.length === 0 ? (
            <SlotEmpty title="This share currently contains no viewable assets." />
          ) : (
            <ul className="space-y-1.5" aria-label={`${fetchState.data.assets.length} review assets`}>
              {fetchState.data.assets.map((asset) => (
                <li
                  key={asset.assetId}
                  className="flex items-baseline justify-between gap-3 rounded-[9px] bg-[var(--bg-surface)] px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-[var(--text-primary)]">{asset.title}</span>
                    <span className="block text-[11px] text-[var(--text-tertiary)]">
                      {asset.kind}
                      {asset.contentHash ? ` · sha256:${asset.contentHash.slice(0, 12)}…` : ""}
                    </span>
                  </span>
                  {asset.signedUrl ? (
                    <a href={asset.signedUrl} className="shrink-0 text-[12px] text-[var(--text-primary)] underline">
                      Open
                    </a>
                  ) : (
                    <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">Preview unavailable</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {!reviewToken && !approval ? (
        <SlotEmpty title="No review requests" hint="Open a review link or select an approval to review it here." />
      ) : null}
      {cardProps ? (
        <div className="mt-2">
          <ApprovalCard
            payload={cardProps.payload}
            status={cardProps.status}
            actions={
              actionable
                ? [
                    { label: "Accept", variant: "approve", onAction: () => onVerdict?.("accept") },
                    { label: "Request revision", variant: "secondary", onAction: () => onVerdict?.("revise") },
                  ]
                : undefined
            }
          />
          {!actionable && cardProps.status !== "pending" ? (
            <p className="mt-2 text-[11.5px] text-[var(--text-tertiary)]">
              This approval is {cardProps.status} and cannot accept a verdict.
            </p>
          ) : null}
        </div>
      ) : null}
    </SlotPanel>
  );
}
