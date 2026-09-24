/** Studio V5 workbench — integer timebase + rational frame rate (STUDIO_14, server-only). */
import "server-only";
import { workbenchError } from "./types";
import type { FrameRate, FrameRounding, Timebase } from "./types";

export function assertTimebase(timebase: Timebase): void {
  if (!timebase || !Number.isInteger(timebase.timescale) || timebase.timescale <= 0) {
    throw workbenchError("BAD_REQUEST", "Timebase timescale must be a positive integer.", {});
  }
}

export function assertFrameRate(fps: FrameRate): void {
  if (!fps || !Number.isInteger(fps.num) || !Number.isInteger(fps.den) || fps.num <= 0 || fps.den <= 0) {
    throw workbenchError("BAD_REQUEST", "Frame rate must be a positive rational num/den.", {});
  }
}

export function assertTicks(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw workbenchError("BAD_REQUEST", `${name} must be integer ticks >= 0.`, { [name]: value });
  }
}

function applyRounding(frames: number, rounding: FrameRounding): number {
  if (rounding === "floor") return Math.floor(frames);
  if (rounding === "ceil") return Math.ceil(frames);
  return Math.round(frames);
}

export interface FrameMapping {
  frames: number;
  rounding: FrameRounding;
  /** Exact fractional frame position before rounding. Source time is preserved. */
  exactFrames: number;
}

/**
 * Convert integer ticks to frames at a rational rate. Rounding is explicit
 * and returned, so callers record how a trim boundary landed. Non-integer
 * rates (e.g. 30000/1001) keep exact source time in `exactFrames`.
 */
export function ticksToFrames(
  ticks: number,
  timebase: Timebase,
  fps: FrameRate,
  rounding: FrameRounding,
): FrameMapping {
  assertTicks(ticks, "ticks");
  assertTimebase(timebase);
  assertFrameRate(fps);
  const exactFrames = (ticks * fps.num) / (timebase.timescale * fps.den);
  return { frames: applyRounding(exactFrames, rounding), rounding, exactFrames };
}

/**
 * Convert frames back to integer ticks. The inverse mapping is exact only
 * when the frame count divides evenly; rounding is explicit and the
 * residual is reported so trims can warn on sub-frame drift.
 */
export function framesToTicks(
  frames: number,
  timebase: Timebase,
  fps: FrameRate,
  rounding: FrameRounding,
): { ticks: number; rounding: FrameRounding; residualTicks: number } {
  if (!Number.isInteger(frames) || frames < 0) {
    throw workbenchError("BAD_REQUEST", "frames must be an integer >= 0.", { frames });
  }
  assertTimebase(timebase);
  assertFrameRate(fps);
  const exactTicks = (frames * timebase.timescale * fps.den) / fps.num;
  const ticks = applyRounding(exactTicks, rounding);
  return { ticks, rounding, residualTicks: ticks - exactTicks };
}

/**
 * Snap a tick position to the nearest frame boundary with explicit
 * rounding. Used for trim handles; the returned boundary is what the
 * edit recipe stores.
 */
export function snapTicksToFrame(
  ticks: number,
  timebase: Timebase,
  fps: FrameRate,
  rounding: FrameRounding,
): { boundaryTicks: number; frames: number; rounding: FrameRounding } {
  const mapped = ticksToFrames(ticks, timebase, fps, rounding);
  const back = framesToTicks(mapped.frames, timebase, fps, "nearest");
  // Recompute with the requested rounding for the tick leg so both legs agree.
  const leg = framesToTicks(mapped.frames, timebase, fps, rounding);
  void back;
  return { boundaryTicks: leg.ticks, frames: mapped.frames, rounding };
}

export function ticksToMs(ticks: number, timebase: Timebase): number {
  assertTicks(ticks, "ticks");
  assertTimebase(timebase);
  return Math.round((ticks / timebase.timescale) * 1000);
}

export function ticksToSeconds(ticks: number, timebase: Timebase): number {
  assertTicks(ticks, "ticks");
  assertTimebase(timebase);
  return ticks / timebase.timescale;
}

/**
 * Format non-drop timecode HH:MM:SS:FF from a frame count at the nominal
 * (integer) display rate. Non-integer rates display against their nominal
 * rate; the exact rational mapping stays in the recipe.
 */
export function formatTimecode(frames: number, nominalFps: number): string {
  if (!Number.isInteger(frames) || frames < 0) {
    throw workbenchError("BAD_REQUEST", "Timecode frames must be an integer >= 0.", { frames });
  }
  if (!Number.isInteger(nominalFps) || nominalFps <= 0) {
    throw workbenchError("BAD_REQUEST", "Nominal fps must be a positive integer.", { nominalFps });
  }
  const totalSeconds = Math.floor(frames / nominalFps);
  const ff = frames - totalSeconds * nominalFps;
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

export interface TicksTimecode {
  timecode: string;
  frames: number;
  rounding: FrameRounding;
  nominalFps: number;
}

/** Full tick→timecode projection with the explicit rounding recorded. */
export function ticksToTimecode(
  ticks: number,
  timebase: Timebase,
  fps: FrameRate,
  rounding: FrameRounding,
): TicksTimecode {
  const mapped = ticksToFrames(ticks, timebase, fps, rounding);
  const nominalFps = Math.round(fps.num / fps.den);
  return { timecode: formatTimecode(mapped.frames, nominalFps), frames: mapped.frames, rounding, nominalFps };
}
