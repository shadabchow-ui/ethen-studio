"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ui/state-surfaces";

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[StudioError]", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--bg-base)]">
      <ErrorPanel
        title="Studio unavailable"
        body="Could not load Studio. Try again or return home."
        onRetry={reset}
      />
    </div>
  );
}
