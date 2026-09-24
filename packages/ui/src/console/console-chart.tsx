"use client";

/**
 * CONSOLE_A1 — the Console chart.
 *
 * Drawn locally in SVG rather than pulling a charting library into the design
 * lab: the whole visual argument is thin lines, a quiet grid and one accent,
 * and every library would have to be argued back down to that. It also keeps
 * the Dashboard bundle honest (spec §132: lazy charts, no heavy flagship
 * bundles on the Dashboard).
 *
 * Accessibility: a chart is an image of data, so the same data is emitted as a
 * real table for screen readers. No chart in the Console communicates through
 * colour alone.
 */
import * as React from "react";
import { formatCount, formatCurrency, type SeriesPoint } from "./console-production-data";
import { chartScale } from "./console-chart-scale";
import styles from "./console-chart.module.css";

export type ChartFormat = "count" | "currency";

function format(value: number, kind: ChartFormat): string {
  return kind === "currency" ? formatCurrency(value) : formatCount(value);
}

export function ConsoleChart({
  points,
  label,
  kind = "count",
  height = 200,
  variant = "line",
  tone = "accent",
}: {
  points: readonly SeriesPoint[];
  label: string;
  kind?: ChartFormat;
  height?: number;
  variant?: "line" | "bars";
  tone?: "accent" | "neutral";
}) {
  /* CONSOLE_C4 — ticks, grid, values and bars share one coordinate system.
   * Inspection state stays local: pointer, touch (pointer events) and
   * keyboard (arrow keys on the focused plot) all read the same scale. */
  const scale = chartScale(
    points.map((point) => point.value),
    { width: 1000, height },
  );
  const { width } = scale;
  const [selected, setSelected] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const allZero = points.length > 0 && scale.max === 0;

  if (points.length === 0) {
    return (
      <figure className={styles.figure} data-tone={tone}>
        <div className={styles.noData} role="img" aria-label={`${label}. No data for this range.`}>
          No data for this range.
        </div>
        <figcaption className={styles.srOnly}>{label}: no data.</figcaption>
      </figure>
    );
  }

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${scale.x(index).toFixed(1)},${scale.y(point.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${scale.zeroY} L0,${scale.zeroY} Z`;

  const gridValues = [0.25, 0.5, 0.75, 1].map((step) => scale.ceiling * step);

  const selectNearest = (clientX: number) => {
    const node = svgRef.current;
    if (!node || points.length === 0) return;
    const rect = node.getBoundingClientRect();
    const fraction = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    setSelected(Math.min(points.length - 1, Math.max(0, Math.round(fraction * (points.length - 1)))));
  };

  const moveSelection = (step: number) => {
    setSelected((current) => {
      const next = (current ?? (step > 0 ? -1 : points.length)) + step;
      return Math.min(points.length - 1, Math.max(0, next));
    });
  };

  const readout =
    selected !== null && points[selected]
      ? `${points[selected].label}: ${format(points[selected].value, kind)}`
      : `${points.length} points · peak ${format(scale.max, kind)}${allZero ? " · all values are zero" : ""}`;

  return (
    <figure className={styles.figure} data-tone={tone}>
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ height }}
        role="img"
        aria-label={`${label}. ${points.length} days, from ${format(points[0]?.value ?? 0, kind)} to ${format(points[points.length - 1]?.value ?? 0, kind)}, peak ${format(scale.max, kind)}.`}
        tabIndex={0}
        onPointerMove={(event) => selectNearest(event.clientX)}
        onPointerLeave={() => setSelected(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            moveSelection(1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveSelection(-1);
          } else if (event.key === "Home") {
            event.preventDefault();
            setSelected(0);
          } else if (event.key === "End") {
            event.preventDefault();
            setSelected(points.length - 1);
          } else if (event.key === "Escape") {
            setSelected(null);
          }
        }}
      >
        {gridValues.map((value) => (
          <line
            key={value}
            className={styles.grid}
            x1={0}
            x2={width}
            y1={scale.y(value)}
            y2={scale.y(value)}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {variant === "bars" ? (
          points.map((point, index) => (
            <rect
              key={point.label}
              className={styles.bar}
              data-selected={selected === index ? "true" : undefined}
              x={scale.barX(index)}
              y={scale.y(point.value)}
              width={scale.barWidth}
              height={Math.max(1, scale.zeroY - scale.y(point.value))}
            />
          ))
        ) : points.length === 1 ? (
          <circle className={styles.point} cx={scale.x(0)} cy={scale.y(points[0].value)} r={3.5} />
        ) : (
          <>
            <path className={styles.area} d={area} />
            <path className={styles.line} d={line} vectorEffect="non-scaling-stroke" />
          </>
        )}
        {selected !== null && points[selected] ? (
          <circle
            className={styles.inspector}
            cx={variant === "bars" ? scale.barX(selected) + scale.barWidth / 2 : scale.x(selected)}
            cy={scale.y(points[selected].value)}
            r={4}
          />
        ) : null}
        <line
          className={styles.axis}
          x1={0}
          x2={width}
          y1={scale.zeroY}
          y2={scale.zeroY}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className={styles.scale} aria-hidden>
        {gridValues
          .slice()
          .reverse()
          .map((value) => (
            <span key={value}>{format(value, kind)}</span>
          ))}
      </div>

      <div className={styles.ticks} aria-hidden>
        {scale.tickIndices.map((tick, position) => (
          <span
            key={tick}
            style={{ left: `${(scale.tickFractions[position] ?? 0) * 100}%` }}
            data-edge={position === 0 ? "start" : position === scale.tickIndices.length - 1 ? "end" : undefined}
          >
            {points[tick]?.label}
          </span>
        ))}
      </div>

      <p className={styles.readout} role="status">
        {readout}
      </p>

      <figcaption className={styles.srOnly}>
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.label}>
                <th scope="row">{point.label}</th>
                <td>{format(point.value, kind)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/** A thin progress bar. Never a radial gauge (spec §68). */
export function ConsoleProgress({
  value,
  max = 100,
  label,
  detail,
}: {
  value: number;
  max?: number;
  label: string;
  detail?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={styles.progress}>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span className={styles.progressFill} style={{ width: `${Math.max(percent, 0.6)}%` }} />
      </div>
      {detail ? <p className={styles.progressDetail}>{detail}</p> : null}
    </div>
  );
}
