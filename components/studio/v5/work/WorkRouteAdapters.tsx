/**
 * STUDIO_18 — work route adapters.
 * Bind /studio/work/* to the V1 routes: projects, assets (with review
 * request handoff), jobs truth (canonical cancel), reviews (decide /
 * comment / links / re-request), notifications. No project => setup
 * state, never empty success.
 */
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StudioPageHeader } from "../shell/PageHeader";
import { StudioEmptyState } from "../shell/states";
import { AssetsLibrary } from "./AssetsLibrary";
import { JobsBoard } from "./JobsBoard";
import { NotificationsCenter } from "./NotificationsCenter";
import { ProjectsLibrary } from "./ProjectsLibrary";
import { ReviewWorkspace } from "./ReviewWorkspace";
import type {
  WorkAssetView,
  WorkCommentView,
  WorkJobView,
  WorkLinkView,
  WorkNotificationView,
  WorkProjectView,
  WorkReviewView,
  WorkUiState,
} from "./types";
import { workUiState } from "./types";
import {
  cancelWorkJob,
  createReviewLink,
  createWorkReview,
  decideWorkReview,
  fetchReviewDetail,
  fetchReviewLinks,
  fetchWorkAssets,
  fetchWorkJobs,
  fetchWorkNotifications,
  fetchWorkProjects,
  fetchWorkReviews,
  markWorkNotificationRead,
  postWorkComment,
  revokeReviewLink,
  workDependencyOf,
  workFailureMessage,
  workStateOf,
} from "./work-api-client";

function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now().toString(36)}`;
}

/** M6B — one Work page frame: flat header, then the surface. */
function WorkPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <StudioPageHeader eyebrow="Work" title={title} description={description} />
      {children}
    </div>
  );
}

function setupBlock(testId: string, title: string, message: string) {
  return (
    <div data-testid={testId} className="space-y-6">
      <StudioPageHeader eyebrow="Work" title={title} description="Project-scoped work." />
      <StudioEmptyState
        title="Choose a project"
        description={message}
        actionLabel="Open projects"
        actionHref="/studio/work/projects"
        testId={`${testId}-no-project`}
      />
    </div>
  );
}

export function ProjectsRouteAdapter() {
  const [uiState, setUiState] = useState<WorkUiState>(workUiState("loading"));
  const [projects, setProjects] = useState<WorkProjectView[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await fetchWorkProjects();
        if (cancelled) return;
        setProjects(loaded);
        setUiState(loaded.length === 0 ? workUiState("empty") : workUiState("ready"));
      } catch (failure) {
        if (!cancelled) setUiState(workUiState(workStateOf(failure), workFailureMessage(failure), workDependencyOf(failure)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return (
    <WorkPage title="Projects" description="Every project you can open, with its latest revision.">
      <ProjectsLibrary
        uiState={uiState}
        projects={projects}
        onRetry={() => {
          setUiState(workUiState("loading"));
          setReloadToken((token) => token + 1);
        }}
      />
    </WorkPage>
  );
}

export function AssetsRouteAdapter({ projectId }: { projectId: string | null }) {
  const [uiState, setUiState] = useState<WorkUiState>(workUiState("loading"));
  const [assets, setAssets] = useState<WorkAssetView[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await fetchWorkAssets(projectId, "");
        if (cancelled) return;
        setAssets(loaded);
        setUiState(loaded.length === 0 ? workUiState("empty") : workUiState("ready"));
      } catch (failure) {
        if (!cancelled) setUiState(workUiState(workStateOf(failure), workFailureMessage(failure), workDependencyOf(failure)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  const requestReview = useCallback(
    async (selected: readonly WorkAssetView[]) => {
      if (!projectId || selected.length === 0) return;
      setNotice(null);
      try {
        const review = await createWorkReview({
          projectId,
          title: `Review: ${selected.length} asset${selected.length === 1 ? "" : "s"}`,
          pinnedAssets: selected.map((asset) => ({
            assetId: asset.assetId,
            version: asset.latestVersion > 0 ? asset.latestVersion : null,
            contentHash: null,
          })),
          idempotencyKey: idempotencyKey(),
        });
        setNotice(`Review “${review.title}” requested.`);
      } catch (failure) {
        setNotice(workFailureMessage(failure));
      }
    },
    [projectId],
  );

  if (!projectId) {
    return setupBlock(
      "work-assets",
      "Assets",
      "Select a project to read its assets. Assets are never listed unscoped.",
    );
  }

  return (
    <WorkPage title="Assets" description="Durable outputs and uploads in the active project.">
      <div className="space-y-3">
        {notice ? (
          <p data-testid="work-assets-notice" role="status" className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
            {notice}
          </p>
        ) : null}
        <AssetsLibrary
          uiState={uiState}
          projectId={projectId}
          assets={assets}
          canRequestReview
          onRetry={() => {
            setUiState(workUiState("loading"));
            setReloadToken((token) => token + 1);
          }}
          onRequestReview={(selected) => void requestReview(selected)}
        />
      </div>
    </WorkPage>
  );
}

export function JobsRouteAdapter({ projectId }: { projectId: string | null }) {
  const [uiState, setUiState] = useState<WorkUiState>(workUiState("loading"));
  const [jobs, setJobs] = useState<WorkJobView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await fetchWorkJobs(projectId);
        if (cancelled) return;
        setJobs(loaded);
        setUiState(loaded.length === 0 ? workUiState("empty") : workUiState("ready"));
      } catch (failure) {
        if (!cancelled) setUiState(workUiState(workStateOf(failure), workFailureMessage(failure), workDependencyOf(failure)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  const cancel = useCallback(
    async (job: WorkJobView) => {
      if (!projectId) return;
      setBusy(job.jobId);
      setNotice(null);
      try {
        await cancelWorkJob(projectId, job.jobId);
        setNotice(`Cancellation requested for ${job.jobId}.`);
        setReloadToken((token) => token + 1);
      } catch (failure) {
        setNotice(workFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId],
  );

  if (!projectId) {
    return setupBlock("work-jobs", "History", "Select a project to read its canonical jobs.");
  }

  return (
    <WorkPage title="History" description="Canonical jobs for the active project, newest first.">
      <JobsBoard
        uiState={uiState}
        jobs={jobs}
        busy={busy}
        notice={notice}
        onRetry={() => {
          setUiState(workUiState("loading"));
          setReloadToken((token) => token + 1);
        }}
        onCancel={(job) => void cancel(job)}
      />
    </WorkPage>
  );
}

export function ReviewsRouteAdapter({
  projectId,
  initialReviewId,
}: {
  projectId: string | null;
  initialReviewId?: string | null;
}) {
  const [uiState, setUiState] = useState<WorkUiState>(workUiState("loading"));
  const [reviews, setReviews] = useState<WorkReviewView[]>([]);
  const [selected, setSelected] = useState<WorkReviewView | null>(null);
  const [comments, setComments] = useState<WorkCommentView[]>([]);
  const [links, setLinks] = useState<WorkLinkView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mintToken, setMintToken] = useState<{ linkId: string; token: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const select = useCallback(
    async (reviewId: string) => {
      if (!projectId) return;
      setBusy("select");
      setNotice(null);
      setMintToken(null);
      try {
        const detail = await fetchReviewDetail(projectId, reviewId);
        setSelected(detail.review);
        setComments(detail.comments);
        setLinks(await fetchReviewLinks(projectId, reviewId).catch(() => []));
      } catch (failure) {
        setNotice(workFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await fetchWorkReviews(projectId);
        if (cancelled) return;
        setReviews(loaded);
        setUiState(loaded.length === 0 ? workUiState("empty") : workUiState("ready"));
        const initial = initialReviewId ? loaded.find((row) => row.reviewId === initialReviewId) : undefined;
        if (initial) void select(initial.reviewId);
      } catch (failure) {
        if (!cancelled) setUiState(workUiState(workStateOf(failure), workFailureMessage(failure), workDependencyOf(failure)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken, initialReviewId, select]);

  const refreshList = useCallback(async () => {
    if (!projectId) return;
    try {
      const loaded = await fetchWorkReviews(projectId);
      setReviews(loaded);
      if (selected) {
        const detail = await fetchReviewDetail(projectId, selected.reviewId);
        setSelected(detail.review);
        setComments(detail.comments);
      }
    } catch (failure) {
      setNotice(workFailureMessage(failure));
    }
  }, [projectId, selected]);

  const decide = useCallback(
    async (review: WorkReviewView, decision: "approved" | "changes_requested" | "denied", feedback: string | null) => {
      if (!projectId) return;
      setBusy("decide");
      setNotice(null);
      try {
        const decided = await decideWorkReview({ projectId, reviewId: review.reviewId, decision, feedback });
        setNotice(`Review ${decided.statusLabel.toLowerCase()}.`);
        await refreshList();
      } catch (failure) {
        setNotice(workFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, refreshList],
  );

  const cancel = useCallback(
    async (review: WorkReviewView) => {
      if (!projectId) return;
      setBusy("cancel");
      setNotice(null);
      try {
        await decideWorkReview({ projectId, reviewId: review.reviewId, action: "cancel" });
        setNotice("Review cancelled.");
        await refreshList();
      } catch (failure) {
        setNotice(workFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, refreshList],
  );

  const comment = useCallback(
    async (body: string) => {
      if (!projectId || !selected) return;
      setBusy("comment");
      setNotice(null);
      try {
        const posted = await postWorkComment({ projectId, reviewId: selected.reviewId, body });
        setComments((prev) => [...prev, posted]);
      } catch (failure) {
        setNotice(workFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId, selected],
  );

  const mintLink = useCallback(
    async (review: WorkReviewView) => {
      if (!projectId) return;
      setBusy("link");
      setNotice(null);
      setMintToken(null);
      try {
        const { link, token } = await createReviewLink({
          projectId,
          reviewId: review.reviewId,
          ttlMs: 7 * 24 * 60 * 60 * 1000,
          idempotencyKey: idempotencyKey(),
        });
        setLinks((prev) => [link, ...prev]);
        setMintToken({ linkId: link.linkId, token });
      } catch (failure) {
        setNotice(workFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId],
  );

  const revoke = useCallback(
    async (link: WorkLinkView) => {
      if (!projectId) return;
      setBusy("revoke");
      setNotice(null);
      try {
        await revokeReviewLink(projectId, link.linkId);
        setLinks((prev) => prev.map((row) => (row.linkId === link.linkId ? { ...row, revokedAt: new Date().toISOString() } : row)));
        setNotice("Link revoked.");
      } catch (failure) {
        setNotice(workFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId],
  );

  const rerequest = useCallback(
    async (review: WorkReviewView) => {
      if (!projectId) return;
      setBusy("rerequest");
      setNotice(null);
      try {
        // Re-pin live versions: fetch each pinned asset's current version
        // from the asset library so the new request is exact.
        const assets = await fetchWorkAssets(projectId, "");
        const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
        const created = await createWorkReview({
          projectId,
          title: review.title,
          pinnedAssets: review.pinnedAssets.map((pin) => ({
            assetId: pin.assetId,
            version: byId.get(pin.assetId)?.latestVersion ?? null,
            contentHash: null,
          })),
          supersedesReviewId: review.reviewId,
          idempotencyKey: idempotencyKey(),
        });
        setNotice(`New review “${created.title}” requested.`);
        setReloadToken((token) => token + 1);
      } catch (failure) {
        setNotice(workFailureMessage(failure));
      } finally {
        setBusy(null);
      }
    },
    [projectId],
  );

  if (!projectId) {
    return setupBlock("work-reviews", "Reviews", "Select a project to read its reviews.");
  }

  return (
    <WorkPage title="Reviews" description="Review requests, decisions and share links for the active project.">
      <ReviewWorkspace
        uiState={uiState}
        reviews={reviews}
        selected={selected}
        comments={comments}
        links={links}
        busy={busy}
        notice={notice}
        mintToken={mintToken}
        onRetry={() => {
          setUiState(workUiState("loading"));
          setReloadToken((token) => token + 1);
        }}
        onSelect={(reviewId) => void select(reviewId)}
        onDecide={(review, decision, feedback) => void decide(review, decision, feedback)}
        onCancel={(review) => void cancel(review)}
        onComment={(body) => void comment(body)}
        onMintLink={(review) => void mintLink(review)}
        onRevokeLink={(link) => void revoke(link)}
        onRerequest={(review) => void rerequest(review)}
      />
    </WorkPage>
  );
}

export function NotificationsRouteAdapter({ projectId }: { projectId: string | null }) {
  const [uiState, setUiState] = useState<WorkUiState>(workUiState("loading"));
  const [notifications, setNotifications] = useState<WorkNotificationView[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await fetchWorkNotifications(projectId);
        if (cancelled) return;
        setNotifications(loaded.notifications);
        setUnread(loaded.unread);
        setUiState(loaded.notifications.length === 0 ? workUiState("empty") : workUiState("ready"));
      } catch (failure) {
        if (!cancelled) setUiState(workUiState(workStateOf(failure), workFailureMessage(failure), workDependencyOf(failure)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadToken]);

  const markRead = useCallback(
    async (notification: WorkNotificationView) => {
      if (!projectId) return;
      setBusy(notification.notificationId);
      try {
        await markWorkNotificationRead(projectId, notification.notificationId);
        setNotifications((prev) =>
          prev.map((row) =>
            row.notificationId === notification.notificationId ? { ...row, readAt: new Date().toISOString() } : row,
          ),
        );
        setUnread((count) => Math.max(0, count - 1));
      } catch {
        setBusy(null);
        return;
      }
      setBusy(null);
    },
    [projectId],
  );

  if (!projectId) {
    return setupBlock("work-notifications", "Notifications", "Select a project to read its notifications.");
  }

  return (
    <WorkPage title="Notifications" description="Review and job activity for the active project.">
      <NotificationsCenter
        uiState={uiState}
        notifications={notifications}
        unread={unread}
        busy={busy}
        onRetry={() => {
          setUiState(workUiState("loading"));
          setReloadToken((token) => token + 1);
        }}
        onMarkRead={(notification) => void markRead(notification)}
      />
    </WorkPage>
  );
}
