/**
 * STUDIO_11 — staged audio journey hook.
 *
 * Creates one audio project, then runs each planned stage through the
 * shared runtime journey (resolve → estimate → admit via /jobs → poll),
 * syncing stage→job lineage to the audio API after every transition.
 * Retry reruns one stage and everything downstream; earlier successes
 * are kept. Mirrors the 09 useCreateJob journey per stage.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isTerminalJobStatus,
  parseAdmittedJob,
  parsePolledJob,
  parseQuote,
  parseRouteDecision,
  type CreateApiError,
  type PolledJobView,
  type QuoteView,
} from "../create-api-client";
import { buildAdmitBody, buildDirectTransformParameters, buildEstimateBody, buildResolveBody } from "../composer-request";
import { hashCreateRequestSync, idempotencyKeyFor } from "../idempotency";
import { AUDIO_STAGE_TASK, type AudioPhase, type AudioProjectView, type AudioStageId, type AudioToolId } from "./types";
import { parseAudioProject } from "./audio-api-client";
import { stagesForTool } from "./audio-tool-bindings";

async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return (await response.json().catch(() => null)) as unknown;
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store" });
  return (await response.json().catch(() => null)) as unknown;
}

export interface UseAudioJobInput {
  projectId: string | null;
  tool: AudioToolId;
  modelSelection: string;
  capIcu: number | null;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  /** Stage parameters (script text, source asset, speaker map, transcript revision). */
  stageParameters: (stage: AudioStageId) => Readonly<Record<string, unknown>>;
  pollIntervalMs?: number;
}

export interface UseAudioJobResult {
  phase: AudioPhase;
  project: AudioProjectView | null;
  currentStage: AudioStageId | null;
  jobs: Readonly<Record<string, PolledJobView>>;
  quotes: Readonly<Record<string, QuoteView>>;
  error: CreateApiError | null;
  busy: boolean;
  start: () => void;
  retryStage: (stage: AudioStageId) => void;
  refresh: () => void;
  reset: () => void;
}

async function syncStage(
  audioProjectId: string,
  projectId: string,
  body: Readonly<Record<string, unknown>>,
): Promise<void> {
  await postJson(`/api/studio/v1/audio/projects/${encodeURIComponent(audioProjectId)}/stages`, {
    projectId,
    ...body,
  }).catch(() => null);
}

async function pollJobUntilTerminal(
  jobId: string,
  projectId: string,
  pollIntervalMs: number,
  cancelled: () => boolean,
): Promise<{ job: PolledJobView | null; error: CreateApiError | null }> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    if (cancelled()) return { job: null, error: { code: "CANCELLED", message: "Cancelled.", retryable: false } };
    try {
      const parsed = parsePolledJob(
        await getJson(`/api/studio/v1/jobs/${encodeURIComponent(jobId)}?projectId=${encodeURIComponent(projectId)}`),
      );
      if (parsed.error || !parsed.job) {
        return { job: null, error: parsed.error ?? { code: "UNKNOWN", message: "Job read failed.", retryable: true } };
      }
      if (isTerminalJobStatus(parsed.job.status)) return { job: parsed.job, error: null };
    } catch {
      return {
        job: null,
        error: { code: "NETWORK_ERROR", message: "Lost contact with the stage job.", retryable: true },
      };
    }
  }
}

export function useAudioJob(input: UseAudioJobInput): UseAudioJobResult {
  const { projectId, tool, modelSelection, capIcu, sourceLanguage, targetLanguage, pollIntervalMs = 3000 } = input;
  const [phase, setPhase] = useState<AudioPhase>("idle");
  const [project, setProject] = useState<AudioProjectView | null>(null);
  const [currentStage, setCurrentStage] = useState<AudioStageId | null>(null);
  const [jobs, setJobs] = useState<Readonly<Record<string, PolledJobView>>>({});
  const [quotes, setQuotes] = useState<Readonly<Record<string, QuoteView>>>({});
  const [error, setError] = useState<CreateApiError | null>(null);
  const [attempts, setAttempts] = useState<Readonly<Record<string, number>>>({});
  const cancelledRef = useRef(false);
  const paramsRef = useRef(input.stageParameters);

  useEffect(() => {
    paramsRef.current = input.stageParameters;
  }, [input.stageParameters]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const refresh = useCallback(() => {
    if (!projectId || !project) return;
    void (async () => {
      const parsed = parseAudioProject(
        await getJson(
          `/api/studio/v1/audio/projects?projectId=${encodeURIComponent(projectId)}&audioProjectId=${encodeURIComponent(project.audioProjectId)}`,
        ),
      );
      if (parsed.project) setProject(parsed.project);
    })();
  }, [projectId, project]);

  const runStages = useCallback(
    async (audioProject: AudioProjectView, fromStage: AudioStageId | null, scopeProjectId: string) => {
      const order = stagesForTool(tool);
      const startIndex = fromStage ? order.indexOf(fromStage) : 0;
      for (let index = startIndex; index < order.length; index += 1) {
        const stage = order[index];
        if (cancelledRef.current) return;
        setCurrentStage(stage);
        const task = AUDIO_STAGE_TASK[stage];
        const parameters = paramsRef.current(stage);
        try {
          setPhase("estimating");
          const resolved = parseRouteDecision(
            await postJson(
              "/api/studio/v1/catalog/resolve",
              buildResolveBody({ projectId: scopeProjectId, task, modelSelection, capIcu }),
            ),
          );
          if (cancelledRef.current) return;
          if (resolved.error || !resolved.decision) {
            const failure = resolved.error ?? { code: "UNKNOWN", message: "Model routing failed.", retryable: true };
            setError(failure);
            setPhase("failed");
            await syncStage(audioProject.audioProjectId, scopeProjectId, {
              stage,
              attempt: attempts[stage] ?? 1,
              status: "failed",
              errorCode: failure.code,
              errorMessage: failure.message,
            });
            refresh();
            return;
          }
          const estimated = parseQuote(
            await postJson(
              "/api/studio/v1/economics/estimate",
              buildEstimateBody({
                projectId: scopeProjectId,
                task,
                endpointId: resolved.decision.endpointId,
                meterQuantity: resolved.decision.meterQuantity,
                priceVersion: resolved.decision.priceVersion,
                capIcu,
              }),
            ),
          );
          if (cancelledRef.current) return;
          if (estimated.error || !estimated.quote) {
            const failure = estimated.error ?? { code: "UNKNOWN", message: "Estimate failed.", retryable: true };
            setError(failure);
            setPhase("failed");
            await syncStage(audioProject.audioProjectId, scopeProjectId, {
              stage,
              attempt: attempts[stage] ?? 1,
              status: "failed",
              errorCode: failure.code,
              errorMessage: failure.message,
            });
            refresh();
            return;
          }
          setQuotes((prev) => ({ ...prev, [stage]: estimated.quote as QuoteView }));

          setPhase("admitting");
          const hash = hashCreateRequestSync({ stage, parameters });
          const admitted = parseAdmittedJob(
            await postJson(
              "/api/studio/v1/jobs",
              buildAdmitBody({
                projectId: scopeProjectId,
                task,
                idempotencyKey: idempotencyKeyFor(`audio-${audioProject.audioProjectId}-${stage}`, hash),
                requestHash: hash,
                quoteId: estimated.quote.quoteId,
                endpointId: resolved.decision.endpointId,
                parameters: buildDirectTransformParameters({ stage, parameters, audioProjectId: audioProject.audioProjectId }),
              }),
            ),
          );
          if (cancelledRef.current) return;
          if (admitted.error || !admitted.job) {
            const failure = admitted.error ?? { code: "UNKNOWN", message: "Stage admission failed.", retryable: true };
            setError(failure);
            setPhase("failed");
            await syncStage(audioProject.audioProjectId, scopeProjectId, {
              stage,
              attempt: attempts[stage] ?? 1,
              status: "failed",
              quoteId: estimated.quote.quoteId,
              estimatedIcu: estimated.quote.estimatedIcu,
              errorCode: failure.code,
              errorMessage: failure.message,
            });
            refresh();
            return;
          }
          setJobs((prev) => ({ ...prev, [stage]: admitted.job as PolledJobView }));
          await syncStage(audioProject.audioProjectId, scopeProjectId, {
            stage,
            attempt: attempts[stage] ?? 1,
            jobId: admitted.job.jobId,
            status: "running",
            quoteId: estimated.quote.quoteId,
            estimatedIcu: estimated.quote.estimatedIcu,
            transcriptRevision: audioProject.transcriptRevision,
          });

          if (!isTerminalJobStatus(admitted.job.status)) {
            setPhase("running");
            const polled = await pollJobUntilTerminal(
              admitted.job.jobId,
              scopeProjectId,
              pollIntervalMs,
              () => cancelledRef.current,
            );
            if (cancelledRef.current) return;
            if (polled.error || !polled.job) {
              const failure = polled.error ?? { code: "UNKNOWN", message: "Stage run failed.", retryable: true };
              setError(failure);
              setPhase("failed");
              await syncStage(audioProject.audioProjectId, scopeProjectId, {
                stage,
                attempt: attempts[stage] ?? 1,
                jobId: admitted.job.jobId,
                status: "failed",
                errorCode: failure.code,
                errorMessage: failure.message,
              });
              refresh();
              return;
            }
            setJobs((prev) => ({ ...prev, [stage]: polled.job as PolledJobView }));
            if (polled.job.status !== "COMPLETED") {
              setError({
                code: "STAGE_FAILED",
                message: `Stage ${stage} ended as ${polled.job.status}. Earlier stages are kept; retry from here.`,
                retryable: true,
              });
              setPhase("failed");
              await syncStage(audioProject.audioProjectId, scopeProjectId, {
                stage,
                attempt: attempts[stage] ?? 1,
                jobId: polled.job.jobId,
                status: "failed",
                errorCode: polled.job.status,
                errorMessage: `Stage ended as ${polled.job.status}.`,
              });
              refresh();
              return;
            }
          }
          await syncStage(audioProject.audioProjectId, scopeProjectId, {
            stage,
            attempt: attempts[stage] ?? 1,
            jobId: (jobs[stage]?.jobId ?? admitted.job.jobId) as string,
            status: "succeeded",
            quoteId: estimated.quote.quoteId,
            estimatedIcu: estimated.quote.estimatedIcu,
          });
        } catch {
          if (cancelledRef.current) return;
          setError({ code: "NETWORK_ERROR", message: "Request failed before reaching the server.", retryable: true });
          setPhase("failed");
          return;
        }
      }
      setCurrentStage(null);
      setPhase("done");
      refresh();
    },
    [tool, modelSelection, capIcu, pollIntervalMs, attempts, jobs, refresh],
  );

  const start = useCallback(() => {
    if (!projectId) {
      setError({ code: "SETUP_REQUIRED", message: "Select a project before starting.", retryable: false });
      return;
    }
    if (phase === "creating" || phase === "estimating" || phase === "admitting" || phase === "running") return;
    cancelledRef.current = false;
    setError(null);
    setJobs({});
    setQuotes({});
    setAttempts({});
    setPhase("creating");
    void (async () => {
      const parsed = parseAudioProject(
        await postJson("/api/studio/v1/audio/projects", {
          projectId,
          kind: tool,
          sourceLanguage,
          targetLanguage,
        }),
      );
      if (cancelledRef.current) return;
      if (parsed.error || !parsed.project) {
        setError(parsed.error ?? { code: "UNKNOWN", message: "Audio project creation failed.", retryable: true });
        setPhase("failed");
        return;
      }
      setProject(parsed.project);
      await runStages(parsed.project, null, projectId);
    })();
  }, [projectId, tool, sourceLanguage, targetLanguage, phase, runStages]);

  const retryStage = useCallback(
    (stage: AudioStageId) => {
      if (!projectId || !project) return;
      if (phase === "creating" || phase === "estimating" || phase === "admitting" || phase === "running") return;
      cancelledRef.current = false;
      setError(null);
      setAttempts((prev) => ({ ...prev, [stage]: (prev[stage] ?? 1) + 1 }));
      void runStages(project, stage, projectId);
    },
    [projectId, project, phase, runStages],
  );

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setPhase("idle");
    setProject(null);
    setCurrentStage(null);
    setJobs({});
    setQuotes({});
    setError(null);
    setAttempts({});
    cancelledRef.current = false;
  }, []);

  return {
    phase,
    project,
    currentStage,
    jobs,
    quotes,
    error,
    busy: phase === "creating" || phase === "estimating" || phase === "admitting" || phase === "running",
    start,
    retryStage,
    refresh,
    reset,
  };
}
