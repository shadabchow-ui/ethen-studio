/**
 * lib/model-intelligence/chartCsv.ts
 * CSV export utility for chart data tables.
 *
 * Handles RFC-compatible escaping for commas, quotes, and newlines.
 * Uses a deterministic filename derived from model and chart identifiers.
 * Pure data logic — no DOM, no external API calls.
 */

import type {
  MIBenchmarkBarDatum,
  MIBenchmarkStackedDatum,
  MIBenchmarkScatterDatum,
} from "./modelIntelligenceTypes";

// ---------------------------------------------------------------------------
// CSV escaping
// ---------------------------------------------------------------------------

/**
 * Escape a cell value per RFC 4180.
 * - Fields containing commas, quotes, or newlines are quoted.
 * - Quotes inside quoted fields are doubled.
 */
export function escapeCsvCell(value: unknown): string {
  const str = String(value ?? "");
  const needsQuoting =
    str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r");

  if (!needsQuoting) return str;

  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV row from an array of cell values.
 */
export function csvRow(cells: string[]): string {
  return cells.map(escapeCsvCell).join(",") + "\n";
}

// ---------------------------------------------------------------------------
// CSV header builders
// ---------------------------------------------------------------------------

/** Headers for bar chart CSV output. */
export function getBarCsvHeaders(unit?: string): string[] {
  return unit ? ["Model", "Provider", "Value", unit] : ["Model", "Provider", "Value"];
}

/** Headers for stacked chart CSV output. */
export function getStackedCsvHeaders(
  data: readonly MIBenchmarkStackedDatum[],
): string[] {
  // Collect all unique segment keys in order of first appearance
  const seen = new Set<string>();
  const headers: string[] = ["Model", "Provider", "Total"];
  for (const datum of data) {
    for (const seg of datum.segments) {
      if (!seen.has(seg.key)) {
        seen.add(seg.key);
        headers.push(seg.key);
      }
    }
  }
  return headers;
}

/** Headers for scatter chart CSV output. */
export const SCATTER_CSV_HEADERS = ["Model", "Provider", "X Value", "Y Value"];

// ---------------------------------------------------------------------------
// Bar data → CSV
// ---------------------------------------------------------------------------

export function barDataToCsv(
  data: readonly MIBenchmarkBarDatum[],
  unit?: string,
): string {
  const headers = getBarCsvHeaders(unit);
  let output = csvRow(headers);
  for (const d of data) {
    output += csvRow([
      d.label,
      d.provider,
      String(d.value),
    ]);
  }
  return output;
}

// ---------------------------------------------------------------------------
// Stacked data → CSV
// ---------------------------------------------------------------------------

/**
 * Convert stacked chart data to CSV.
 * Columns: Model, Provider, Total, segment1, segment2, ...
 * Segment values are only included if they exist on that row.
 */
export function stackedDataToCsv(
  data: readonly MIBenchmarkStackedDatum[],
): string {
  const headers = getStackedCsvHeaders(data);
  let output = csvRow(headers);
  for (const d of data) {
    const total = d.segments.reduce((s, seg) => s + seg.value, 0);
    const row: string[] = [d.label, d.provider, String(total)];
    for (let i = 3; i < headers.length; i++) {
      const seg = d.segments.find((s) => s.key === headers[i]);
      row.push(seg ? String(seg.value) : "");
    }
    output += csvRow(row);
  }
  return output;
}

// ---------------------------------------------------------------------------
// Scatter data → CSV
// ---------------------------------------------------------------------------

export function scatterDataToCsv(
  data: readonly MIBenchmarkScatterDatum[],
): string {
  let output = csvRow(SCATTER_CSV_HEADERS);
  for (const d of data) {
    output += csvRow([
      d.label,
      d.provider,
      String(d.x),
      String(d.y),
    ]);
  }
  return output;
}

// ---------------------------------------------------------------------------
// Safe filename generation
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic filename from model and chart identifiers.
 * Sanitizes the name to be safe for all file systems.
 */
export function generateCsvFilename(
  modelSlug: string,
  chartId: string,
): string {
  const sanitized = `${modelSlug}-${chartId}`
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return `${sanitized}.csv`;
}

// ---------------------------------------------------------------------------
// Browser download helper
// ---------------------------------------------------------------------------

/**
 * Trigger a CSV download in the browser.
 * Creates a Blob with text/csv MIME type and triggers download via
 * a temporary anchor element. No external data is transmitted.
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// End-to-end helpers
// ---------------------------------------------------------------------------

/**
 * Generate the complete CSV content, filename, and trigger download
 * for the current visible chart data.
 */
export function exportBarCsv(
  data: readonly MIBenchmarkBarDatum[],
  modelSlug: string,
  chartId: string,
): void {
  const csv = barDataToCsv(data);
  const filename = generateCsvFilename(modelSlug, chartId);
  downloadCsv(csv, filename);
}

export function exportStackedCsv(
  data: readonly MIBenchmarkStackedDatum[],
  modelSlug: string,
  chartId: string,
): void {
  const csv = stackedDataToCsv(data);
  const filename = generateCsvFilename(modelSlug, chartId);
  downloadCsv(csv, filename);
}

export function exportScatterCsv(
  data: readonly MIBenchmarkScatterDatum[],
  modelSlug: string,
  chartId: string,
): void {
  const csv = scatterDataToCsv(data);
  const filename = generateCsvFilename(modelSlug, chartId);
  downloadCsv(csv, filename);
}
