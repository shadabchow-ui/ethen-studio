import type { Metadata } from "next";
import { StudioShell } from "@ethen/ui/design-system/v2/shells/StudioShell";

import { RealtimeRouteAdapter } from "@/components/studio/v5/realtime/RealtimeRouteAdapter";
import { resolvePageProjectId } from "@/lib/studio-v5/active-project-server";

export const metadata: Metadata = {
  title: "Voice Agents",
  description: "Realtime voice agent sessions: spend caps, transcripts, tool oversight and reconnect recovery.",
  alternates: {
    canonical: "/studio/voice-agents",
  },
};

/**
 * STUDIO_16 — first-class Voice Agents route. Transport readiness is
 * server-rendered truth: without substrate credentials (or explicit synthetic
 * mode) the page states unavailability instead of offering a fake connect.
 * Batch Voice and Chat voice live elsewhere and are untouched.
 */
export default async function StudioVoiceAgentsRoute({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const query = await searchParams;
  const projectId = await resolvePageProjectId(query);
  const synthetic = process.env.STUDIO_REALTIME_SYNTHETIC === "1";
  const managedReady = Boolean(
    process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_WS_URL,
  );
  const transportReady = managedReady || synthetic;
  return (
    <StudioShell dataSource="live">
      <RealtimeRouteAdapter
        projectId={projectId}
        transportReady={transportReady}
        transportMessage={
          transportReady
            ? null
            : "Voice Agents need a realtime media subscription that this workspace has not configured. Batch Voice still works."
        }
      />
    </StudioShell>
  );
}
