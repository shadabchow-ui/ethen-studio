import "server-only";

/**
 * STUDIO_11 audio route errors, shared by the Supabase adapter and the
 * P04 fixture lane. dependency-free so lane tests stay hermetic; both
 * adapters throw (and every audio route catches) this one class.
 */
export class AudioRouteError extends Error {
  readonly status: "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR" | "FORBIDDEN";
  constructor(status: AudioRouteError["status"], message: string) {
    super(message);
    this.name = "AudioRouteError";
    this.status = status;
  }
}
