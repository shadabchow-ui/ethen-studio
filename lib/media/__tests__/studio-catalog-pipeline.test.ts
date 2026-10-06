import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// RC6: the classifier lives in the projection pipeline (plain node module);
// lib tests already import from scripts/ (catalog-completeness precedent).
import {
  classifyFromSnapshot,
  classifyTask,
  dispositionForTask,
} from "../../../scripts/media-models/lib.mjs";
import { TASK_NAMES } from "@ethen/studio-core/contracts/tasks";
import {
  TASK_LABELS,
  UNCLASSIFIED_TASK_LABEL,
  taskLabel,
} from "@ethen/studio-core/catalog/task-labels";
import {
  TASK_MAP_VERSION,
  isCoveredFalSlug,
} from "@ethen/studio-core/catalog/task-map";
import {
  buildLocalSource,
  type LocalCatalogJson,
} from "@ethen/studio-core/catalog/source-local";
import { projectCatalog } from "@ethen/studio-core/catalog/projection";

// The pipeline module is untyped JS; alias the three helpers with the loose
// shapes this suite relies on instead of tsc's inferred literal types.
type SnapshotClassifier = (input: {
  url?: string | null;
  identifier?: string;
  category?: string | null;
  inputNames?: string[];
  schemaNames?: readonly (string | undefined)[];
  priorTask?: string;
  priorEvidence?: string | null;
}) => { task: string; task_evidence: string };
const classifySnapshot = classifyFromSnapshot as unknown as SnapshotClassifier;
const keywordClassify = classifyTask as unknown as (
  urlPath: string,
  identifier: string,
) => { task: string; task_evidence: string };
const dispositionFor = dispositionForTask as unknown as (task: string) => {
  disposition: string;
  reason: string;
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GENERATED = JSON.parse(
  readFileSync(join(ROOT, "lib/media/generated/fal-catalog.json"), "utf8"),
) as {
  catalog_version: string;
  dispositions: Record<string, number>;
  records: {
    family_id: string;
    task_ids: string[];
    tasks: string[];
    supports_fine_tuning: boolean;
    endpoints: {
      endpoint_id: string;
      task: string;
      task_evidence: string;
      disposition: string;
      disposition_reason: string | null;
      schema: { status: string; snapshot: string | null };
      capabilities: { required_inputs: string[] | null; supported_inputs: string[] | null };
    }[];
  }[];
};
const COVERAGE = JSON.parse(
  readFileSync(join(ROOT, "data/media-models/schema-coverage.json"), "utf8"),
) as { endpoints_total: number; supported: number };
const CHECKPOINT = JSON.parse(
  readFileSync(join(ROOT, "data/media-models/schema-import-checkpoint.json"), "utf8"),
) as { done?: Record<string, { status?: string; snapshot?: string }> };
const ENDPOINT_ROWS = new Map(
  (
    readFileSync(join(ROOT, "data/media-models/fal-media-endpoints.jsonl"), "utf8")
      .trim()
      .split("\n") as string[]
  ).map((line) => {
    const row = JSON.parse(line) as {
      endpoint_id: string;
      url: string;
      name_raw: string;
      task: string;
      task_evidence: string;
    };
    return [row.endpoint_id, row] as const;
  }),
);
const CANONICAL_TASKS = new Map<string, string>();
for (const line of readFileSync(
  join(ROOT, "data/media-models/canonical-media-models.jsonl"),
  "utf8",
)
  .trim()
  .split("\n")) {
  const record = JSON.parse(line) as {
    media: { member_endpoints: { endpoint_id: string; task?: string }[] };
  };
  for (const member of record.media.member_endpoints) {
    if (member.task) CANONICAL_TASKS.set(member.endpoint_id, member.task);
  }
}

const ALL_ENDPOINTS = GENERATED.records.flatMap((record) =>
  record.endpoints.map((endpoint) => ({ record, endpoint })),
);

function classify(
  endpointId: string,
  opts: {
    category?: string | null;
    inputNames?: string[];
    schemaNames?: string[];
    priorTask?: string;
    priorEvidence?: string | null;
  } = {},
): { task: string; task_evidence: string } {
  const row = ENDPOINT_ROWS.get(endpointId);
  return classifySnapshot({
    url: row?.url ?? `https://fal.ai/models/${endpointId}`,
    identifier: row?.name_raw ?? endpointId.split("/").slice(1).join("/"),
    category: opts.category ?? null,
    inputNames: opts.inputNames ?? [],
    schemaNames: opts.schemaNames ?? [],
    priorTask: opts.priorTask ?? "unknown",
    priorEvidence: opts.priorEvidence ?? null,
  });
}

test("RC6 schema-first: exact fal slugs win outright", () => {
  // Explicit URL slug beats any inference (incl. a contradicting category).
  assert.equal(
    classify("minimax/h3-max/lip-sync/image-to-video", {
      category: "video-to-video",
      inputNames: ["video_url"],
    }).task,
    "image-to-video",
  );
  assert.equal(
    classify("alibaba/happy-horse/reference-to-video", {
      category: "image-to-video",
      inputNames: ["image_url", "prompt"],
    }).task,
    "reference-to-video",
  );
  assert.equal(
    classify("fal-ai/speech-to-text/turbo", { category: "speech-to-text", inputNames: ["audio_url"] })
      .task,
    "speech-to-text",
  );
});

test("RC6 schema-first: category x inputs arbitrate the variant", () => {
  // Masked image-to-image is editing; unmasked is variation.
  assert.equal(
    classify("fal-ai/fast-sdxl/inpainting", {
      category: "image-to-image",
      inputNames: ["prompt", "image_url", "mask_url"],
    }).task,
    "image-editing",
  );
  assert.equal(
    classify("bytedance/seedream/v5/lite/edit", {
      category: "image-to-image",
      inputNames: ["prompt", "image_url"],
    }).task,
    "image-to-image",
  );
  // Image input on a text-to-image snapshot is image-conditioned generation.
  assert.equal(
    classify("fal-ai/flux-1/dev/image-to-image", {
      category: "text-to-image",
      inputNames: ["prompt", "image_url"],
    }).task,
    "image-to-image",
  );
  // Reference inputs on image-to-video recover reference-to-video.
  assert.equal(
    classify("wan/v2.6/reference-to-video", {
      category: "image-to-video",
      inputNames: ["prompt", "reference_image_urls"],
    }).task,
    "reference-to-video",
  );
  // Audio+image to video is image-to-video; audio+video is video-to-video.
  assert.equal(
    classify("fal-ai/echomimic-v3", {
      category: "audio-to-video",
      inputNames: ["audio_url", "image_url"],
    }).task,
    "image-to-video",
  );
  assert.equal(
    classify("fal-ai/elevenlabs/dubbing", {
      category: "audio-to-video",
      inputNames: ["audio_url", "video_url"],
    }).task,
    "video-to-video",
  );
  // Decisive categories ignore inputs.
  assert.equal(
    classify("fal-ai/flux-2-trainer-v2/edit", {
      category: "training",
      inputNames: ["image_data_url", "learning_rate"],
    }).task,
    "lora-training",
  );
  assert.equal(
    classify("fal-ai/florence-2-large/caption", {
      category: "vision",
      inputNames: ["image_url"],
    }).task,
    "language-model",
  );
  assert.equal(
    classify("fal-ai/cohere-transcribe", {
      category: "speech-to-text",
      inputNames: ["audio_url"],
    }).task,
    "speech-to-text",
  );
  assert.equal(
    classify("fal-ai/demucs", { category: "audio-to-audio", inputNames: ["audio_url"] }).task,
    "audio-to-audio",
  );
  assert.equal(
    classify("fal-ai/dia-tts", { category: "text-to-speech", inputNames: ["text"] }).task,
    "speech",
  );
});

test("RC6 schema-first: vector and music refinements", () => {
  assert.equal(
    classify("fal-ai/recraft/v4/text-to-vector", {
      category: "text-to-image",
      inputNames: ["prompt"],
      schemaNames: ["RecraftV4TextToVectorInput", "RecraftV4TextToVectorOutput"],
    }).task,
    "text-to-vector",
  );
  assert.equal(
    classify("fal-ai/recraft/vectorize", {
      category: "image-to-image",
      inputNames: ["image_url"],
      schemaNames: ["RecraftVectorizeInput", "RecraftVectorizeOutput"],
    }).task,
    "image-to-vector",
  );
  // Fal lumps music under text-to-audio; the name disambiguates.
  assert.equal(
    classify("fal-ai/minimax-music/v2", { category: "text-to-audio", inputNames: ["prompt"] }).task,
    "music-generation",
  );
  assert.equal(
    classify("sonilo/v1.1/video-to-music", {
      category: "video-to-audio",
      inputNames: ["video_url"],
    }).task,
    "music-generation",
  );
});

test("RC6 schema-first: ambiguous names resolve from the snapshot", () => {
  // Trainer paths carrying generation abbreviations stay training.
  assert.equal(
    classify("fal-ai/wan-trainer/t2v", {
      category: "training",
      inputNames: ["training_data_url"],
    }).task,
    "lora-training",
  );
  // Version-looking v2a is text-to-image per its snapshot, not video-to-audio.
  assert.equal(
    classify("fal-ai/ideogram/v2a", { category: "text-to-image", inputNames: ["prompt"] }).task,
    "text-to-image",
  );
  // Inference LoRAs are generation, not training.
  assert.equal(
    classify("fal-ai/ernie-image/lora", { category: "text-to-image", inputNames: ["prompt"] }).task,
    "text-to-image",
  );
  // Uncategorized workflow utilities stay unclassified (reviewable).
  assert.equal(
    classify("fal-ai/workflow-utilities/interleave-video", {
      category: "unknown",
      inputNames: ["video_urls"],
      priorTask: "video-editing",
    }).task,
    "unknown",
  );
  assert.equal(
    classify("fal-ai/workflow-utilities/pick-image-by-index", {
      category: "workflow",
      inputNames: ["image_urls"],
      priorTask: "image-generation",
    }).task,
    "unknown",
  );
  // No signal anywhere: unknown with the preserved residual evidence.
  assert.deepEqual(classify("fal-ai/pixart-sigma"), {
    task: "unknown",
    task_evidence: "no-taxonomy-signal",
  });
});

test("RC6 synonyms: keyword fallback covers the expanded table", () => {
  const cases: [string, string][] = [
    ["fal-ai/wan-t2v", "text-to-video"],
    ["fal-ai/wan-i2v", "image-to-video"],
    ["fal-ai/id-v2v", "video-to-video"],
    ["fal-ai/lcm-sd15-i2i", "image-to-image"],
    ["fal-ai/flux-1/dev/redux", "image-to-image"],
    ["fal-ai/ltx-2.3/reframe", "video-editing"],
    ["blackforestlabs/flux-3/extend-video", "video-editing"],
    ["fal-ai/pixverse/v5/transition", "video-editing"],
    ["fal-ai/pixverse/lipsync", "video-editing"],
    ["clarityai/crystal-upscaler", "image-editing"],
    ["clarityai/crystal-video-upscaler", "video-editing"],
    ["fal-ai/bytedance-upscaler/upscale/video", "video-editing"],
    ["bria/fibo-edit/relight", "image-editing"],
    ["fal-ai/fashn/tryon/v1.5", "image-editing"],
    ["fal-ai/cat-vton", "image-editing"],
    ["fal-ai/ideogram/remove-background", "image-editing"],
    ["fal-ai/image-preprocessors/depth-anything/v2", "image-editing"],
    ["fal-ai/depth-anything-video", "video-editing"],
    ["fal-ai/ace-step/audio-inpaint", "audio-to-audio"],
    // No "video" word and no snapshot: the honest keyword fallback is the
    // image bucket (the schema stage routes the real endpoint to video).
    ["fal-ai/ltx-2.3-quality/inpaint", "image-editing"],
    ["bria/video/erase/mask", "video-editing"],
    ["bria/fibo-edit/erase_by_text", "image-editing"],
    ["fal-ai/ernie-image-trainer", "lora-training"],
    ["fal-ai/flux-lora-fast-training", "lora-training"],
    ["fal-ai/dia-tts/voice-clone", "speech"],
    ["fal-ai/cohere-transcribe", "speech-to-text"],
    ["fal-ai/ideogram/v2a", "video-to-audio"],
    ["fal-ai/controlfoley", "video-to-audio"],
    ["fal-ai/invisible-watermark", "image-editing"],
    ["openrouter/router/openai/v1/responses", "language-model"],
    ["openrouter/router/openai/v1/embeddings", "language-model"],
  ];
  for (const [endpointId, expected] of cases) {
    // No snapshot: pure keyword fallback over URL + identifier.
    const got = classify(endpointId);
    assert.equal(got.task, expected, `${endpointId}: got ${got.task} (${got.task_evidence})`);
    assert.ok(got.task_evidence.startsWith("keyword:"), `${endpointId}: ${got.task_evidence}`);
  }
});

test("RC6 synonyms: normalize-time residuals keep no-taxonomy-signal", () => {
  // The J01 unknown_task_preserved invariant stays truthful: the expanded
  // table only adds matches; residuals still carry no-taxonomy-signal.
  assert.deepEqual(keywordClassify("/fal-ai/pixart-sigma", "pixart-sigma"), {
    task: "unknown",
    task_evidence: "no-taxonomy-signal",
  });
  assert.deepEqual(keywordClassify("/minimax/h3-max/director", "h3-max/director"), {
    task: "unknown",
    task_evidence: "no-taxonomy-signal",
  });
  assert.equal(
    dispositionFor("unknown").disposition,
    "quarantined",
    "unknown stays quarantined/reviewable",
  );
  assert.equal(dispositionFor("language-model").disposition, "excluded");
  assert.equal(dispositionFor("audio-to-audio").disposition, "eligible");
});

test("RC6 registry: schema status matches coverage counts", () => {
  const supported = ALL_ENDPOINTS.filter((e) => e.endpoint.schema.status === "supported");
  const unavailable = ALL_ENDPOINTS.filter((e) => e.endpoint.schema.status === "unavailable");
  assert.equal(ALL_ENDPOINTS.length, COVERAGE.endpoints_total);
  assert.equal(supported.length, COVERAGE.supported);
  assert.equal(unavailable.length, COVERAGE.endpoints_total - COVERAGE.supported);
  // Each status agrees with the import checkpoint (the re-projection source).
  for (const { endpoint } of ALL_ENDPOINTS) {
    const done = CHECKPOINT.done?.[endpoint.endpoint_id];
    if (endpoint.schema.status === "supported") {
      assert.equal(done?.status, "supported", endpoint.endpoint_id);
      assert.ok(
        endpoint.schema.snapshot && existsSync(join(ROOT, endpoint.schema.snapshot)),
        `${endpoint.endpoint_id}: snapshot ref resolves`,
      );
    } else {
      assert.notEqual(done?.status, "supported", endpoint.endpoint_id);
    }
  }
});

test("RC6 registry: unknown-task ratio stays under the ceiling", () => {
  // Before: 586/1500 (39.1%) unknown, 292 families touched, 190 all-unknown.
  // After: 6/1500 (0.4%) unknown — opaque proper-noun names without schemas
  // plus two uncategorized workflow utilities. Ceiling: 3% with headroom.
  const unknown = ALL_ENDPOINTS.filter((e) => e.endpoint.task === "unknown");
  assert.ok(
    unknown.length / ALL_ENDPOINTS.length <= 0.03,
    `unknown-task ratio ${(unknown.length / ALL_ENDPOINTS.length).toFixed(3)} exceeds 3%`,
  );
  for (const { endpoint } of unknown) {
    assert.equal(endpoint.disposition, "quarantined", endpoint.endpoint_id);
    assert.equal(endpoint.task_evidence, "no-taxonomy-signal", endpoint.endpoint_id);
  }
  // Dispositions stay consistent with tasks; tallies match live counts.
  // The projector recomputes the disposition exactly when it reclassifies.
  for (const { endpoint } of ALL_ENDPOINTS) {
    const row = ENDPOINT_ROWS.get(endpoint.endpoint_id);
    const prior = CANONICAL_TASKS.get(endpoint.endpoint_id) ?? row?.task ?? "unknown";
    if (endpoint.task !== prior) {
      assert.equal(
        endpoint.disposition,
        dispositionFor(endpoint.task).disposition,
        endpoint.endpoint_id,
      );
    }
    if (endpoint.task === "unknown") {
      assert.equal(endpoint.disposition, "quarantined", endpoint.endpoint_id);
    }
    if (endpoint.disposition === "excluded") assert.equal(endpoint.task, "language-model");
    if (endpoint.task === "language-model") assert.equal(endpoint.disposition, "excluded");
  }
  assert.equal(GENERATED.dispositions.quarantined, unknown.length);
  assert.equal(
    GENERATED.dispositions.eligible +
      GENERATED.dispositions.quarantined +
      GENERATED.dispositions.excluded,
    ALL_ENDPOINTS.length,
  );
});

test("RC6 registry: every task slug is covered by the task map", () => {
  // The RC6.2 exhaustiveness requirement: the classifier must never emit a
  // slug the runtime cannot map or explicitly browse-only.
  assert.equal(TASK_MAP_VERSION, "1.1.0");
  for (const { endpoint } of ALL_ENDPOINTS) {
    assert.ok(isCoveredFalSlug(endpoint.task), `${endpoint.endpoint_id}: ${endpoint.task}`);
    assert.match(
      endpoint.task_evidence,
      /^(schema:|keyword:|prior:|no-taxonomy-signal$)/,
      endpoint.endpoint_id,
    );
  }
});

test("RC6 registry: family rollups derive from member tasks", () => {
  for (const record of GENERATED.records) {
    const memberTasks = [...new Set(record.endpoints.map((e) => e.task))].sort();
    const known = memberTasks.filter((t) => t !== "unknown");
    const expected = known.length > 0 ? known : memberTasks.slice(0, 1);
    assert.deepEqual(record.task_ids, expected, record.family_id);
    assert.equal(record.tasks.length, record.task_ids.length, record.family_id);
    assert.equal(
      record.supports_fine_tuning,
      record.task_ids.includes("lora-training"),
      record.family_id,
    );
  }
});

test("RC6 projection: every supported schema yields parameters (no snapshots)", () => {
  // The public projection is built with NO snapshot files — the serverless
  // shape — proving prod serves identical parameters to local dev.
  const source = buildLocalSource(GENERATED as unknown as LocalCatalogJson, {});
  const projection = projectCatalog(source, new Map(), new Map(), new Set(), {
    catalogVersion: GENERATED.catalog_version,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(projection.taskMapVersion, TASK_MAP_VERSION);
  assert.equal(projection.endpoints.length, ALL_ENDPOINTS.length);
  const byId = new Map(projection.endpoints.map((e) => [e.endpointId, e]));
  let withParams = 0;
  for (const { endpoint } of ALL_ENDPOINTS) {
    const projected = byId.get(endpoint.endpoint_id);
    assert.ok(projected, endpoint.endpoint_id);
    if (endpoint.schema.status === "supported") {
      assert.ok(
        projected!.supportedParameters.length > 0,
        `${endpoint.endpoint_id}: supported schema yields no supportedParameters`,
      );
      withParams += 1;
      for (const name of projected!.requiredParameters) {
        assert.ok(
          (projected!.supportedParameters as readonly string[]).includes(name),
          `${endpoint.endpoint_id}: required ${name} missing from supported`,
        );
      }
    }
  }
  assert.equal(withParams, COVERAGE.supported);
});

test("RC6 projection: registry matches a classifier replay (no hand edits)", () => {
  // Replay the projection-time classifier over independent inputs (snapshot
  // files + endpoint rows) and require byte-identical tasks and evidence.
  let checked = 0;
  for (const { endpoint } of ALL_ENDPOINTS) {
    const snapPath =
      endpoint.schema.status === "supported" ? endpoint.schema.snapshot : null;
    let snapDoc: {
      category?: string;
      input_name?: string;
      refs_available?: string[];
      input?: { properties?: Record<string, unknown> };
    } | null = null;
    if (snapPath) {
      snapDoc = JSON.parse(readFileSync(join(ROOT, snapPath), "utf8"));
    }
    const row = ENDPOINT_ROWS.get(endpoint.endpoint_id);
    const replay = classifySnapshot({
      url: row?.url ?? null,
      identifier: row?.name_raw ?? "",
      category: snapDoc?.category ?? null,
      inputNames: snapDoc ? Object.keys(snapDoc.input?.properties ?? {}) : [],
      schemaNames: snapDoc
        ? [snapDoc.input_name, ...(snapDoc.refs_available ?? [])].filter(Boolean)
        : [],
      priorTask:
        CANONICAL_TASKS.get(endpoint.endpoint_id) ?? row?.task ?? "unknown",
      priorEvidence: row?.task_evidence ?? null,
    });
    assert.equal(replay.task, endpoint.task, endpoint.endpoint_id);
    assert.equal(replay.task_evidence, endpoint.task_evidence, endpoint.endpoint_id);
    checked += 1;
  }
  assert.equal(checked, ALL_ENDPOINTS.length);
});

test("RC6 projection: catalog payload stays at or below today", () => {
  // Before: 1,287,359 bytes prod-shape (1,560,090 dev-shape with forms).
  // After: names for all 1487 supported schemas, empty forms omitted.
  const source = buildLocalSource(GENERATED as unknown as LocalCatalogJson, {});
  const projection = projectCatalog(source, new Map(), new Map(), new Set(), {
    catalogVersion: GENERATED.catalog_version,
    nowIso: "2026-01-01T00:00:00.000Z",
  });
  const bytes = Buffer.byteLength(JSON.stringify({ ok: true, data: { catalog: projection } }), "utf8");
  assert.ok(bytes <= 1287359, `catalog payload ${bytes} exceeds today's 1287359`);
});

test("RC6 labels: TASK_LABELS is exhaustive over TASK_NAMES", () => {
  assert.equal(Object.keys(TASK_LABELS).length, TASK_NAMES.length);
  for (const name of TASK_NAMES) {
    const label = TASK_LABELS[name];
    assert.ok(label && label.length > 0, name);
    assert.notEqual(label, name, `${name}: label must not be the raw token`);
  }
  assert.equal(UNCLASSIFIED_TASK_LABEL, "Other / unclassified");
  assert.equal(taskLabel("unknown"), "Other / unclassified");
  assert.equal(taskLabel(null), "Other / unclassified");
  assert.equal(taskLabel("not-a-task"), "Other / unclassified");
  assert.equal(taskLabel("image.generate"), "Image Generation");
  assert.equal(taskLabel("audio.transform"), "Audio Transformation");
});
