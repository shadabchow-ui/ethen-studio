/**
 * STUDIO_14 — browser-safe timecode helpers (mirrors the kernel timebase
 * math for display; the recipe stays authoritative on tick positions).
 */

export function ticksToFrames(ticks: number, timescale: number, fpsNum: number, fpsDen: number): number {
  if (!Number.isInteger(ticks) || ticks < 0) return 0;
  if (timescale <= 0 || fpsNum <= 0 || fpsDen <= 0) return 0;
  return Math.floor((ticks * fpsNum) / (timescale * fpsDen));
}

export function formatTimecode(frames: number, nominalFps: number): string {
  if (!Number.isInteger(frames) || frames < 0) frames = 0;
  if (!Number.isInteger(nominalFps) || nominalFps <= 0) nominalFps = 30;
  const totalSeconds = Math.floor(frames / nominalFps);
  const ff = frames - totalSeconds * nominalFps;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}:${pad(ff)}`;
}

export function ticksToTimecode(ticks: number, timescale: number, fpsNum: number, fpsDen: number): string {
  const nominal = Math.max(1, Math.round(fpsNum / fpsDen));
  return formatTimecode(ticksToFrames(ticks, timescale, fpsNum, fpsDen), nominal);
}

export function framesToTicks(frames: number, timescale: number, fpsNum: number, fpsDen: number): number {
  if (!Number.isInteger(frames)) return 0;
  if (timescale <= 0 || fpsNum <= 0 || fpsDen <= 0) return 0;
  return Math.round((frames * timescale * fpsDen) / fpsNum);
}

export function ticksToSecondsLabel(ticks: number, timescale: number): string {
  if (timescale <= 0) return "0.0s";
  return `${(ticks / timescale).toFixed(1)}s`;
}
