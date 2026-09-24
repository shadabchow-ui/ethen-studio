/** Studio V5 economics — integer metering (STUDIO_04). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import { EconomicsError, type MeterUnit, type UsageReport } from "./types";
import { assertIntegerQuantity } from "./quote-math";

/** Canonical meter unit per task. Children and realtime meter separately. */
export function meterUnitForTask(task: TaskName): MeterUnit {
  switch (task) {
    case "image.generate":
    case "image.edit":
      return "image";
    case "speech.synthesize":
      return "character";
    case "speech.transcribe":
    case "speech.align":
    case "text.translate":
      return "second";
    case "music.generate":
    case "audio.generate":
    case "audio.transform":
    case "video.generate":
    case "video.edit":
    case "timeline.render":
      return "second";
    case "mesh.generate":
      return "task_unit";
    case "agent.plan":
    case "agent.investigate":
    case "agent.invoke":
      return "task_unit";
    default:
      throw new EconomicsError("INVALID_INPUT", `No meter unit for task ${task as string}.`);
  }
}

/**
 * Validate a usage report: integer quantity or explicit null-unknown.
 * Unknown usage stays reconciling — callers must never substitute a guess.
 */
export function validateUsage(task: TaskName, report: UsageReport): void {
  const expected = meterUnitForTask(task);
  if (report.meterUnit !== expected && report.meterUnit !== "task_unit" && report.meterUnit !== "child_unit") {
    throw new EconomicsError(
      "INVALID_INPUT",
      `Usage unit ${report.meterUnit} does not meter ${task} (expected ${expected}).`,
    );
  }
  if (report.quantity !== null) assertIntegerQuantity(report.meterUnit, report.quantity);
  if (report.providerMinor !== null && (!Number.isInteger(report.providerMinor) || report.providerMinor < 0)) {
    throw new EconomicsError("INVALID_INPUT", "Provider usage must be null or a non-negative integer.");
  }
}

export interface ConnectedInterval {
  /** Integer epoch milliseconds, end-exclusive. */
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * Meter realtime connected intervals: merge overlaps (duplicate-event
 * dedupe), exclude reconnect gaps, return integer connected seconds.
 * Sub-second remainders round up to one billable second per session.
 */
export function meterRealtimeIntervals(intervals: readonly ConnectedInterval[]): number {
  for (const interval of intervals) {
    if (!Number.isInteger(interval.startMs) || !Number.isInteger(interval.endMs) || interval.endMs < interval.startMs) {
      throw new EconomicsError("INVALID_INPUT", "Realtime intervals must be integer [startMs, endMs) with end >= start.");
    }
  }
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  let connectedMs = 0;
  let cursorStart = sorted[0].startMs;
  let cursorEnd = sorted[0].endMs;
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    if (next.startMs <= cursorEnd) {
      cursorEnd = Math.max(cursorEnd, next.endMs);
    } else {
      connectedMs += cursorEnd - cursorStart;
      cursorStart = next.startMs;
      cursorEnd = next.endMs;
    }
  }
  connectedMs += cursorEnd - cursorStart;
  return connectedMs <= 0 ? 0 : Math.floor((connectedMs + 999) / 1000);
}

/** Aggregate child quantities (each an integer) into one integer total. */
export function meterChildren(children: readonly number[]): number {
  let total = 0;
  for (const quantity of children) {
    assertIntegerQuantity("child_unit", quantity);
    total += quantity;
  }
  return total;
}
