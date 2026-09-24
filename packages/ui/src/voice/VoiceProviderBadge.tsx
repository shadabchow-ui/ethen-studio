import { cn } from "../lib/utils";
import { VoiceProviderId } from "@ethen/contracts/voice/types";

interface VoiceProviderBadgeProps {
  provider: VoiceProviderId;
  className?: string;
}

export function VoiceProviderBadge({ provider, className }: VoiceProviderBadgeProps) {
  const styles: Record<VoiceProviderId, string> = {
    openai: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
    elevenlabs: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
    mock: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] border-dashed",
    cartesia: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
    local: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
    deepgram: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
    assemblyai: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
    twilio: "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
  };

  const labelMap: Record<VoiceProviderId, string> = {
    openai: "OpenAI",
    elevenlabs: "ElevenLabs",
    mock: "Mock",
    cartesia: "Cartesia",
    local: "Local",
    deepgram: "Deepgram",
    assemblyai: "AssemblyAI",
    twilio: "Twilio",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase",
        styles[provider] || "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
        className
      )}
    >
      {labelMap[provider] || provider}
    </span>
  );
}
