/**
 * STUDIO_15 — composites route adapter.
 * Binds /studio/marketing and /studio/influencer to the V1 composites
 * routes: templates, campaign heads, detail (variants + reviews), fanout,
 * review request/decision. No project => setup state, never empty success.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import type { CampaignBriefView, CampaignView, CompositeKindView, CompositeUiState, ReviewView, TemplateView, VariantView } from "./types";
import { CompositeWorkspace, compositesFailureMessage } from "./CompositeWorkspace";
import {
  CompositesApiError,
  createCampaign,
  decideReview,
  fanoutVariants,
  fetchCampaignDetail,
  fetchCampaigns,
  fetchTemplates,
  requestReview,
} from "./composites-api-client";

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now().toString(36)}`;
}

export function CompositesRouteAdapter({ kind, projectId }: { kind: CompositeKindView; projectId: string | null }) {
  const [uiState, setUiState] = useState<CompositeUiState>({ state: "loading" });
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignView[]>([]);
  const [selected, setSelected] = useState<CampaignView | null>(null);
  const [variants, setVariants] = useState<VariantView[]>([]);
  const [reviews, setReviews] = useState<ReviewView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [loadedTemplates, loadedCampaigns] = await Promise.all([
          fetchTemplates(projectId, kind),
          fetchCampaigns(projectId, kind),
        ]);
        if (cancelled) return;
        setTemplates(loadedTemplates);
        setCampaigns(loadedCampaigns);
        setUiState(
          loadedCampaigns.length === 0
            ? { state: "empty", message: "Start from a versioned template; variants fan out under your budget cap." }
            : { state: "ready" },
        );
      } catch (failure) {
        if (cancelled) return;
        if (failure instanceof CompositesApiError && failure.code === "SETUP_REQUIRED") {
          setUiState({ state: "setup", message: compositesFailureMessage(failure), dependency: failure.dependency });
        } else {
          setUiState({ state: "error", message: compositesFailureMessage(failure) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, kind, reloadToken]);

  const refreshDetail = useCallback(
    async (pid: string, campaignId: string) => {
      const detail = await fetchCampaignDetail(pid, campaignId);
      setSelected(detail.campaign);
      setVariants(detail.variants);
      setReviews(detail.reviews);
      setCampaigns((prev) => prev.map((c) => (c.campaignId === campaignId ? detail.campaign : c)));
    },
    [],
  );

  const handleSelect = useCallback(
    (campaignId: string) => {
      if (!projectId) return;
      setNotice(null);
      void refreshDetail(projectId, campaignId).catch((failure: unknown) => setNotice(compositesFailureMessage(failure)));
    },
    [projectId, refreshDetail],
  );

  const handleCreate = useCallback(
    (input: { title: string; templateId: string; templateVersion: number; appId: string; brief: CampaignBriefView }) => {
      if (!projectId) return;
      setBusy("create");
      setNotice(null);
      void createCampaign({ projectId, kind, ...input, idempotencyKey: idempotencyKey() })
        .then((campaign) => {
          setCampaigns((prev) => [campaign, ...prev.filter((row) => row.campaignId !== campaign.campaignId)]);
          setUiState({ state: "ready" });
          setNotice(`Campaign "${campaign.title}" created.`);
          return refreshDetail(projectId, campaign.campaignId);
        })
        .catch((failure: unknown) => setNotice(compositesFailureMessage(failure)))
        .finally(() => setBusy(null));
    },
    [projectId, kind, refreshDetail],
  );

  const handleFanout = useCallback(
    (input: { aspectIds: string[]; identities: { identityId: string; version: number | null }[]; costPerVariantIcu: number }) => {
      if (!projectId || !selected) return;
      setBusy("fanout");
      setNotice(null);
      const costEstimateIcuByAspect: Record<string, number> = {};
      for (const aspectId of input.aspectIds) costEstimateIcuByAspect[aspectId] = input.costPerVariantIcu;
      void fanoutVariants({ projectId, campaignId: selected.campaignId, ...input, costEstimateIcuByAspect })
        .then((result) => {
          const refused = result.refused.length > 0 ? ` ${result.refused.length} refused by budget.` : "";
          setNotice(`${result.admitted.length} variants admitted (${result.totalAdmittedIcu} ICU).${refused}`);
          return refreshDetail(projectId, selected.campaignId);
        })
        .catch((failure: unknown) => setNotice(compositesFailureMessage(failure)))
        .finally(() => setBusy(null));
    },
    [projectId, selected, refreshDetail],
  );

  const handleRequestReview = useCallback(() => {
    if (!projectId || !selected) return;
    setBusy("review");
    setNotice(null);
    void requestReview({ projectId, campaignId: selected.campaignId, expiresAt: null })
      .then(() => {
        setNotice("Review requested; variant versions pinned.");
        return refreshDetail(projectId, selected.campaignId);
      })
      .catch((failure: unknown) => setNotice(compositesFailureMessage(failure)))
      .finally(() => setBusy(null));
  }, [projectId, selected, refreshDetail]);

  const handleDecide = useCallback(
    (reviewId: string, decision: "approved" | "denied", feedback: string | null) => {
      if (!projectId || !selected) return;
      setBusy("review");
      setNotice(null);
      void decideReview({ projectId, campaignId: selected.campaignId, reviewId, decision, feedback })
        .then((review) => {
          setNotice(`Review ${review.status}.`);
          return refreshDetail(projectId, selected.campaignId);
        })
        .catch((failure: unknown) => setNotice(compositesFailureMessage(failure)))
        .finally(() => setBusy(null));
    },
    [projectId, selected, refreshDetail],
  );

  const effectiveUiState: CompositeUiState = !projectId
    ? { state: "setup", message: "Select a project to open compositions. Campaigns are project-scoped." }
    : uiState;

  return (
    <CompositeWorkspace
      kind={kind}
      uiState={effectiveUiState}
      templates={templates}
      campaigns={campaigns}
      selected={selected}
      variants={variants}
      reviews={reviews}
      busy={busy}
      notice={notice}
      onSelectCampaign={handleSelect}
      onCreateCampaign={handleCreate}
      onFanout={handleFanout}
      onRequestReview={handleRequestReview}
      onDecideReview={handleDecide}
      onRetry={() => setReloadToken((t) => t + 1)}
    />
  );
}
