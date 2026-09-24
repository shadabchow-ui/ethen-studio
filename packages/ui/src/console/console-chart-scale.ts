/**
 * CONSOLE_C4 — one coordinate system for Console charts.
 *
 * Ticks, gridlines, plotted values and bars all derive from THIS module, so
 * the HTML tick labels, the SVG grid and the data cannot drift apart. The
 * zero baseline is truthful (y(0) is the axis), and bars are clamped inside
 * the plot — first/last bars never overflow the bounds.
 *
 * Pure TypeScript: no React, no DOM. Vitest (node) safe.
 */
export type ChartScaleOptions = Readonly<{
  width: number;
  height: number;
  padTop?: number;
  padBottom?: number;
  /** Headroom above the peak so the line never touches the frame. */
  headroom?: number;
  /** Fraction of the per-point slot a bar fills. */
  barFill?: number;
}>;

export type ChartScale = Readonly<{
  width: number;
  height: number;
  plotTop: number;
  plotBottom: number;
  plotHeight: number;
  max: number;
  ceiling: number;
  /** Plot x for a point index (single points sit at the plot start). */
  x: (index: number) => number;
  /** Plot y for a value (clamped to the plot). */
  y: (value: number) => number;
  /** Zero baseline == the axis. */
  zeroY: number;
  barWidth: number;
  /** Bar left edge, clamped so first/last bars stay inside the plot. */
  barX: (index: number) => number;
  /** Tick label positions as fractions of the plot width. */
  tickFractions: readonly number[];
  /** Point indices the tick labels name. */
  tickIndices: readonly number[];
}>;

export function chartScale(values: readonly number[], options: ChartScaleOptions): ChartScale {
  const { width, height } = options;
  const padTop = options.padTop ?? 12;
  const padBottom = options.padBottom ?? 22;
  const headroom = options.headroom ?? 1.12;
  const barFill = options.barFill ?? 0.62;
  const plotTop = padTop;
  const plotBottom = height - padBottom;
  const plotHeight = Math.max(1, plotBottom - plotTop);
  const count = values.length;

  const max = values.reduce((peak, value) => Math.max(peak, value), 0);
  const ceiling = Math.max(max * headroom, 1);

  const x = (index: number): number => {
    if (count <= 1) return 0;
    return (Math.min(Math.max(index, 0), count - 1) / (count - 1)) * width;
  };
  const y = (value: number): number => {
    const clamped = Math.min(Math.max(value, 0), ceiling);
    return plotTop + plotHeight - (clamped / ceiling) * plotHeight;
  };

  const barWidth = count === 0 ? 0 : (width / count) * barFill;
  const barX = (index: number): number => {
    const ideal = x(index) - barWidth / 2;
    return Math.min(Math.max(ideal, 0), Math.max(width - barWidth, 0));
  };

  const tickIndices: readonly number[] =
    count === 0 ? [] : [0, Math.floor(count / 3), Math.floor((count * 2) / 3), count - 1];
  const tickFractions: readonly number[] = tickIndices.map((index) => (count <= 1 ? 0 : index / (count - 1)));

  return {
    width,
    height,
    plotTop,
    plotBottom,
    plotHeight,
    max,
    ceiling,
    x,
    y,
    zeroY: plotBottom,
    barWidth,
    barX,
    tickFractions,
    tickIndices,
  };
}
