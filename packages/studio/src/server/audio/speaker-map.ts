/** Studio V5 audio — speaker→VoiceIdentity map (STUDIO_11). Server-only. */
import "server-only";
import type { ProjectScope } from "../../contracts/scope";
import type { CanonicalTranscript } from "../media/transcript";
import { validateTranscript } from "../media/transcript";
import type { IdentityPort } from "../identity/types";
import { audioError, type SpeakerVoiceBinding } from "./types";

export interface SpeakerMapEntry {
  speakerId: string;
  voiceIdentityId: string;
  voiceVersion: number;
}

export interface ValidatedSpeakerMap {
  entries: readonly SpeakerVoiceBinding[];
  /** Transcript speakers covered, in transcript order. */
  coveredSpeakers: readonly string[];
}

/**
 * Build the speaker map for a dub/changer project. Every transcript
 * speaker must map to exactly one VoiceIdentity version; unknown
 * speakers, duplicate speakers, missing identities, and consent-blocked
 * identities all fail closed with explicit codes. The map is
 * re-validated at every stage dispatch so a revocation mid-run stops
 * the run instead of synthesizing with a stale grant.
 */
export async function buildSpeakerMap(args: {
  scope: ProjectScope;
  transcript: CanonicalTranscript;
  entries: readonly SpeakerMapEntry[];
  identities: IdentityPort;
}): Promise<ValidatedSpeakerMap> {
  const transcript = validateTranscript(args.transcript);
  const declared = new Set(transcript.speakers.map((speaker) => speaker.speaker_id));
  const seen = new Set<string>();
  const validated: SpeakerVoiceBinding[] = [];

  for (const entry of args.entries) {
    if (!declared.has(entry.speakerId)) {
      throw audioError("AUDIO_SPEAKER_MISMATCH", `Speaker ${entry.speakerId} is not in the transcript.`, {
        speakerId: entry.speakerId,
      });
    }
    if (seen.has(entry.speakerId)) {
      throw audioError("AUDIO_SPEAKER_MISMATCH", `Speaker ${entry.speakerId} is mapped twice.`, {
        speakerId: entry.speakerId,
      });
    }
    seen.add(entry.speakerId);
    if (!entry.voiceIdentityId.trim()) {
      throw audioError("AUDIO_SPEAKER_UNMAPPED", `Speaker ${entry.speakerId} has no voice identity.`, {
        speakerId: entry.speakerId,
      });
    }
    const bundle = await args.identities.getBundle(entry.voiceIdentityId, entry.voiceVersion);
    if (!bundle) {
      throw audioError("AUDIO_SPEAKER_MISMATCH", `Voice identity for ${entry.speakerId} was not found.`, {
        speakerId: entry.speakerId,
        voiceIdentityId: entry.voiceIdentityId,
      });
    }
    const decision = await args.identities.checkUse(args.scope, entry.voiceIdentityId, entry.voiceVersion, "generate");
    if (!decision.allowed) {
      throw audioError("AUDIO_CONSENT_BLOCKED", `Voice for ${entry.speakerId} is blocked: ${decision.reason}`, {
        speakerId: entry.speakerId,
        voiceIdentityId: entry.voiceIdentityId,
        code: decision.code,
      });
    }
    validated.push({
      speakerId: entry.speakerId,
      voiceIdentityId: entry.voiceIdentityId,
      voiceVersion: entry.voiceVersion,
      consentStatus: decision.code,
    });
  }

  const missing = transcript.speakers
    .map((speaker) => speaker.speaker_id)
    .filter((speakerId) => !seen.has(speakerId));
  if (missing.length > 0) {
    throw audioError("AUDIO_SPEAKER_UNMAPPED", `Speakers without a voice: ${missing.join(", ")}.`, { missing });
  }

  return {
    entries: validated,
    coveredSpeakers: transcript.speakers.map((speaker) => speaker.speaker_id),
  };
}

/**
 * Re-check every mapped voice before a stage dispatch. Returns the first
 * blocking entry, or null when the whole map is still usable. Mid-run
 * revocation surfaces here so the journey can halt with a staged
 * failure instead of synthesizing against a revoked grant.
 */
export async function findRevokedSpeakerEntry(args: {
  scope: ProjectScope;
  entries: readonly SpeakerVoiceBinding[];
  identities: IdentityPort;
}): Promise<SpeakerVoiceBinding | null> {
  for (const entry of args.entries) {
    const decision = await args.identities.checkUse(args.scope, entry.voiceIdentityId, entry.voiceVersion, "generate");
    if (!decision.allowed) return entry;
  }
  return null;
}
