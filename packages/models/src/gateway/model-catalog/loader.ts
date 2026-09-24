import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  ExtractionConfidence,
  GatewayModelCapabilityFamily,
  GatewayModelCatalogModel,
  GatewayModelCatalogRow,
  GatewayModelCatalogSnapshot,
} from "./types";
import {
  EXPECTED_GATEWAY_MODEL_CSV_HEADER,
  GATEWAY_MODEL_CSV_PATH,
} from "./types";
import { resolveGatewayCanonicalModel } from "../model-intelligence";

let snapshotPromise: Promise<GatewayModelCatalogSnapshot> | null = null;

function normalizeCell(value: string | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeProviderSlug(provider: string): string {
  return provider.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseDelimitedList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCapabilityFamily(value: string | null): GatewayModelCapabilityFamily {
  if (!value) {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case "text":
      return "text";
    case "code":
      return "code";
    case "image":
      return "image";
    case "video":
      return "video";
    case "embed":
    case "embedding":
      return "embedding";
    case "rerank":
      return "rerank";
    case "realtime":
      return "realtime";
    case "speech":
      return "speech";
    case "transcription":
      return "transcription";
    case "reasoning":
      return "reasoning";
    case "long-context":
    case "long_context":
      return "long-context";
    default:
      return "unknown";
  }
}

function normalizeConfidence(value: string | null): ExtractionConfidence | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }

  return null;
}

function parseCsvDocument(source: string): string[][] {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      const hasContent = currentRow.some((cell) => cell.trim() !== "");
      if (hasContent) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some((cell) => cell.trim() !== "")) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function toRow(header: string[], cells: string[]): GatewayModelCatalogRow {
  const getValue = (column: string) => normalizeCell(cells[header.indexOf(column)]);

  return {
    model_id: getValue("model_id") ?? "",
    provider: getValue("provider") ?? "",
    model_name: getValue("model_name"),
    capability_family: getValue("capability_family"),
    context_window: getValue("context_window"),
    max_output_tokens: getValue("max_output_tokens"),
    latency: getValue("latency"),
    throughput: getValue("throughput"),
    input_price: getValue("input_price"),
    output_price: getValue("output_price"),
    cache_read_price: getValue("cache_read_price"),
    cache_write_price: getValue("cache_write_price"),
    web_search_price: getValue("web_search_price"),
    capabilities: getValue("capabilities"),
    source_files: getValue("source_files"),
    extraction_confidence: getValue("extraction_confidence"),
    notes: getValue("notes"),
  };
}

function sortModels(models: GatewayModelCatalogModel[]): GatewayModelCatalogModel[] {
  return [...models].sort((left, right) => {
    if (left.providerSlug !== right.providerSlug) {
      return left.providerSlug.localeCompare(right.providerSlug);
    }
    return left.model_id.localeCompare(right.model_id);
  });
}

async function readSnapshot(): Promise<GatewayModelCatalogSnapshot> {
  const absoluteCsvPath = path.join(process.cwd(), GATEWAY_MODEL_CSV_PATH);
  const source = await readFile(absoluteCsvPath, "utf8");
  const rows = parseCsvDocument(source);

  if (rows.length === 0) {
    return {
      csvPath: GATEWAY_MODEL_CSV_PATH,
      header: [],
      models: [],
      diagnostics: {
        csvPath: GATEWAY_MODEL_CSV_PATH,
        header: [],
        headerMatchesExpected: false,
        rowCount: 0,
        parsedCount: 0,
        duplicateModelIds: [],
        droppedDuplicateCount: 0,
        invalidConfidenceRows: [],
        missingRequiredRows: [],
      },
    };
  }

  const [header, ...bodyRows] = rows;
  const headerMatchesExpected =
    header.length === EXPECTED_GATEWAY_MODEL_CSV_HEADER.length &&
    header.every((value, index) => value === EXPECTED_GATEWAY_MODEL_CSV_HEADER[index]);

  const models: GatewayModelCatalogModel[] = [];
  const duplicateModelIds = new Set<string>();
  const seenModelIds = new Set<string>();
  const invalidConfidenceRows: Array<{ modelId: string; value: string }> = [];
  const missingRequiredRows: Array<{
    rowNumber: number;
    modelId: string | null;
    provider: string | null;
  }> = [];

  bodyRows.forEach((cells, rowIndex) => {
    const row = toRow(header, cells);
    const modelId = row.model_id || null;
    const provider = row.provider || null;

    if (!modelId || !provider) {
      missingRequiredRows.push({
        rowNumber: rowIndex + 2,
        modelId,
        provider,
      });
      return;
    }

    if (seenModelIds.has(modelId)) {
      duplicateModelIds.add(modelId);
      return;
    }
    seenModelIds.add(modelId);

    const extractionConfidence = normalizeConfidence(row.extraction_confidence);
    if (row.extraction_confidence && extractionConfidence == null) {
      invalidConfidenceRows.push({
        modelId,
        value: row.extraction_confidence,
      });
    }

    models.push({
      ...row,
      providerSlug: normalizeProviderSlug(row.provider),
      capabilityFamily: normalizeCapabilityFamily(row.capability_family),
      capabilityTags: parseDelimitedList(row.capabilities),
      sourceFileList: parseDelimitedList(row.source_files),
      extractionConfidence,
      canonicalResolution: resolveGatewayCanonicalModel({ modelId, providerId: normalizeProviderSlug(row.provider) }),
    });
  });

  const sortedModels = sortModels(models);

  return {
    csvPath: GATEWAY_MODEL_CSV_PATH,
    header,
    models: sortedModels,
    diagnostics: {
      csvPath: GATEWAY_MODEL_CSV_PATH,
      header,
      headerMatchesExpected,
      rowCount: bodyRows.length,
      parsedCount: sortedModels.length,
      duplicateModelIds: [...duplicateModelIds].sort(),
      droppedDuplicateCount: duplicateModelIds.size,
      invalidConfidenceRows,
      missingRequiredRows,
    },
  };
}

export async function loadGatewayModelCatalog(): Promise<GatewayModelCatalogSnapshot> {
  if (!snapshotPromise) {
    snapshotPromise = readSnapshot();
  }

  return snapshotPromise;
}

export function resetGatewayModelCatalogCache() {
  snapshotPromise = null;
}
