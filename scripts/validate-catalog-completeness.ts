/**
 * MUSE-004 — catalog completeness validator (runs under tsx, no build step).
 *
 * For every canonical catalog entry asserts the full chain:
 *   canonical record -> endpoint row(s) -> schema snapshot (when the
 *   checkpoint claims one) -> every required input maps to a
 *   renderer-supported control -> output modality is job-runner supported
 *   -> projected display metadata is present.
 *
 * Missing schema imports are justified exceptions (checkpoint reason),
 * never silent gaps. Unmapped required inputs, unparseable snapshots,
 * dangling endpoint refs and missing projected metadata are gaps and
 * fail the run. Writes artifacts/studio-closure/catalog-coverage.json.
 *
 * Usage: node --import tsx scripts/validate-catalog-completeness.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  controlForInput,
  outputSupportForSnapshot,
} from "../lib/media/schema-controls";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(HERE, "..");

export type EntryStatus = "complete" | "exception" | "gap";

export interface EntryResult {
  family_id: string;
  status: EntryStatus;
  endpoints: number;
  schema_supported: number;
  exceptions: string[];
  gaps: string[];
  notes: string[];
}

export interface CoverageReport {
  generated_at: string;
  validator: string;
  catalog_sha256: string;
  entries_total: number;
  complete: number;
  exceptions: number;
  gaps: number;
  open_model_families: string[];
  entries: EntryResult[];
}

interface CanonicalMember {
  endpoint_id: string;
  [key: string]: unknown;
}

interface CanonicalRecord {
  identity: { repo_id: string; name: string };
  media: {
    category: string;
    member_endpoints: CanonicalMember[];
  };
  [key: string]: unknown;
}

function readJsonl<T>(path: string): T[] {
  const text = readFileSync(path, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line) as T);
}

export function validateCatalog(root: string = DEFAULT_ROOT): CoverageReport {
  const canonPath = join(root, "data/media-models/canonical-media-models.jsonl");
  const endpointsPath = join(root, "data/media-models/fal-media-endpoints.jsonl");
  const checkpointPath = join(root, "data/media-models/schema-import-checkpoint.json");
  const generatedPath = join(root, "lib/media/generated/fal-catalog.json");

  const canonRaw = readFileSync(canonPath, "utf8");
  const records = readJsonl<CanonicalRecord>(canonPath);
  const endpointRows = readJsonl<{ endpoint_id: string }>(endpointsPath);
  const endpointIds = new Set(endpointRows.map((row) => row.endpoint_id));
  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as {
    done?: Record<string, { status?: string; snapshot?: string; reason?: string; at?: string }>;
  };
  const generated = JSON.parse(readFileSync(generatedPath, "utf8")) as {
    canonical_sha256: string;
    records: Record<string, unknown>[];
  };
  const projectedByFamily = new Map(
    generated.records.map((record) => [record.family_id as string, record]),
  );

  const entries: EntryResult[] = [];
  const openModelFamilies: string[] = [];

  for (const record of records) {
    const familyId = record.identity.repo_id;
    const exceptions: string[] = [];
    const gaps: string[] = [];
    const notes: string[] = [];
    const members = record.media.member_endpoints ?? [];
    let schemaSupported = 0;

    if (members.length === 0) {
      gaps.push("no member endpoints");
    }
    for (const member of members) {
      const endpointId = member.endpoint_id;
      if (!endpointIds.has(endpointId)) {
        gaps.push(`${endpointId}: member ref missing from fal-media-endpoints.jsonl`);
        continue;
      }
      const snapRef = checkpoint.done?.[endpointId];
      if (snapRef?.status !== "supported" || !snapRef.snapshot) {
        const reason = snapRef?.status === "failed"
          ? `schema import failed (${snapRef.reason ?? "no reason recorded"})`
          : "schema not yet imported";
        exceptions.push(`${endpointId}: ${reason}`);
        continue;
      }
      const snapPath = join(root, snapRef.snapshot);
      if (!existsSync(snapPath)) {
        gaps.push(`${endpointId}: checkpoint claims snapshot but file is missing (${snapRef.snapshot})`);
        continue;
      }
      let snapshot: Record<string, unknown>;
      try {
        snapshot = JSON.parse(readFileSync(snapPath, "utf8")) as Record<string, unknown>;
      } catch {
        gaps.push(`${endpointId}: snapshot file does not parse (${snapRef.snapshot})`);
        continue;
      }
      const input = snapshot.input as { required?: unknown; properties?: unknown } | undefined;
      if (!input || typeof input !== "object" || !input.properties || typeof input.properties !== "object") {
        gaps.push(`${endpointId}: snapshot has no input.properties object`);
        continue;
      }
      schemaSupported += 1;
      const required = Array.isArray(input.required) ? (input.required as unknown[]) : [];
      const properties = input.properties as Record<string, unknown>;
      for (const name of required) {
        if (typeof name !== "string") {
          gaps.push(`${endpointId}: required input name is not a string`);
          continue;
        }
        if (!(name in properties)) {
          gaps.push(`${endpointId}: required input ${name} missing from properties`);
          continue;
        }
        const mapped = controlForInput(name, properties[name]);
        if (mapped.control === "unsupported") {
          gaps.push(`${endpointId}: required input has no renderer control: ${mapped.reason}`);
        }
      }
      for (const [name, prop] of Object.entries(properties)) {
        if ((required as unknown[]).includes(name)) continue;
        const mapped = controlForInput(name, prop);
        if (mapped.control === "unsupported") {
          notes.push(`${endpointId}: optional input without renderer control: ${mapped.reason}`);
        }
      }
      const output = outputSupportForSnapshot(snapshot);
      if (!output.supported) {
        gaps.push(`${endpointId}: output not job-runner supported (${output.reason})`);
      }
    }

    // Projected display metadata must carry every field the generic
    // detail renderer reads (values may be honestly null/unknown, but
    // the keys must exist so the UI never branches on shape).
    const projected = projectedByFamily.get(familyId);
    if (!projected) {
      gaps.push("family missing from generated projection");
    } else {
      for (const key of ["name", "provider", "family_id", "modality", "openness"]) {
        if (projected[key] === undefined) gaps.push(`projected record missing ${key}`);
      }
      if (!("license" in projected)) gaps.push("projected record missing license");
      const projectedEndpoints = projected.endpoints as Record<string, unknown>[] | undefined;
      if (!Array.isArray(projectedEndpoints) || projectedEndpoints.length !== members.length) {
        gaps.push(`projected endpoints (${projectedEndpoints?.length ?? 0}) != members (${members.length})`);
      } else {
        for (const endpoint of projectedEndpoints) {
          if (!("license" in endpoint)) gaps.push(`${endpoint.endpoint_id}: projected endpoint missing license`);
          const pricing = endpoint.pricing as Record<string, unknown> | undefined;
          if (!pricing || !("unit" in pricing) || !("status" in pricing)) {
            gaps.push(`${endpoint.endpoint_id}: projected endpoint missing pricing unit/status`);
          }
          if (!("limits" in endpoint)) gaps.push(`${endpoint.endpoint_id}: projected endpoint missing limits`);
        }
      }
      if (projected.openness === "open-weights" || projected.openness === "mixed") {
        openModelFamilies.push(familyId);
      }
    }

    const status: EntryStatus = gaps.length > 0 ? "gap" : exceptions.length > 0 ? "exception" : "complete";
    entries.push({
      family_id: familyId,
      status,
      endpoints: members.length,
      schema_supported: schemaSupported,
      exceptions,
      gaps,
      notes,
    });
  }

  // Reconciliation both ways: every source endpoint projected exactly once.
  const projectedIds = new Set<string>();
  for (const record of generated.records) {
    for (const endpoint of (record.endpoints as { endpoint_id: string }[])) {
      if (projectedIds.has(endpoint.endpoint_id)) {
        entries.push({
          family_id: "(projection)",
          status: "gap",
          endpoints: 0,
          schema_supported: 0,
          exceptions: [],
          gaps: [`duplicate projected endpoint ${endpoint.endpoint_id}`],
          notes: [],
        });
      }
      projectedIds.add(endpoint.endpoint_id);
    }
  }
  for (const id of endpointIds) {
    if (!projectedIds.has(id)) {
      entries.push({
        family_id: "(projection)",
        status: "gap",
        endpoints: 0,
        schema_supported: 0,
        exceptions: [],
        gaps: [`source endpoint never projected: ${id}`],
        notes: [],
      });
    }
  }

  openModelFamilies.sort();
  return {
    generated_at: new Date().toISOString(),
    validator: "muse-004-validate-catalog-completeness-v1",
    catalog_sha256: createHash("sha256").update(canonRaw, "utf8").digest("hex"),
    entries_total: records.length,
    complete: entries.filter((entry) => entry.status === "complete").length,
    exceptions: entries.filter((entry) => entry.status === "exception").length,
    gaps: entries.filter((entry) => entry.status === "gap").length,
    open_model_families: openModelFamilies,
    entries,
  };
}

function main(): void {
  const root = DEFAULT_ROOT;
  const report = validateCatalog(root);
  const outDir = join(root, "artifacts/studio-closure");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "catalog-coverage.json"), `${JSON.stringify(report, null, 2)}\n`);
  const summary = {
    ok: report.gaps === 0,
    entries: report.entries_total,
    complete: report.complete,
    exceptions: report.exceptions,
    gaps: report.gaps,
    open_model_families: report.open_model_families.length,
  };
  console.log(JSON.stringify(summary));
  if (report.gaps > 0) {
    for (const entry of report.entries.filter((candidate) => candidate.status === "gap").slice(0, 20)) {
      console.error(`GAP ${entry.family_id}: ${entry.gaps.join("; ")}`);
    }
    process.exitCode = 1;
  }
}

const invokedAsScript = process.argv[1]?.endsWith("validate-catalog-completeness.ts") ?? false;
if (invokedAsScript) main();
