/**
 * STUDIO_13 — run projection hook. Polls the run projection while the run
 * is active; stops on terminal states. Errors are exposed (not swallowed)
 * with a retry action.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasApiError, fetchRunProjection } from "./canvas-api-client";
import type { CanvasRunProjection } from "./types";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export interface UseCanvasRun {
  projection: CanvasRunProjection | null;
  loading: boolean;
  error: CanvasApiError | null;
  refresh: () => void;
}

export function useCanvasRun(runId: string | null, projectId: string | null): UseCanvasRun {
  const [projection, setProjection] = useState<CanvasRunProjection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<CanvasApiError | null>(null);
  const [nonce, setNonce] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  // Render-time reset when the watched run changes (no sync setState in effects).
  const key = runId && projectId ? `${projectId}:${runId}:${nonce}` : null;
  if (key !== activeKey) {
    setActiveKey(key);
    setProjection(null);
    setError(null);
    setLoading(key !== null);
  }

  useEffect(() => {
    if (!runId || !projectId) return;
    let cancelled = false;
    fetchRunProjection(runId, projectId)
      .then((next) => {
        if (cancelled) return;
        setProjection(next);
        setError(null);
        setLoading(false);
        if (!TERMINAL.has(next.status) && timer.current === null) {
          timer.current = setTimeout(() => {
            timer.current = null;
            setNonce((value) => value + 1);
          }, 2500);
        }
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setError(
          failure instanceof CanvasApiError
            ? failure
            : new CanvasApiError(0, "REQUEST_FAILED", "Could not load the run."),
        );
      });
    return () => {
      cancelled = true;
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [runId, projectId, nonce]);

  return { projection, loading, error, refresh };
}
