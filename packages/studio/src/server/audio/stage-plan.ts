/** Studio V5 audio — stage plans and estimates (STUDIO_11). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import {
  AUDIO_JOB_KINDS,
  AUDIO_STAGE_IDS,
  AUDIO_STAGE_LABELS,
  AUDIO_STAGE_TASKS,
  audioError,
  type AudioJobEstimate,
  type AudioJobKind,
  type AudioStageEstimate,
  type AudioStageId,
} from "./types";

export interface StagePlanInput {
  kind: AudioJobKind;
  /** BCP-47 source locale, or null when the stage detects it. */
  sourceLanguage: string | null;
  /** BCP-47 dub target locale; required for dub. */
  targetLanguage: string | null;
  /** Locales the resolved endpoint claims; empty means unqualified. */
  endpointLocales: readonly string[];
  /** Meter unit + ICU rate the resolved endpoint attests. */
  meterUnit: string;
  icuPerUnit: number;
  /** Estimated billable units per stage (seconds/chars per endpoint docs). */
  unitsPerStage: Readonly<Record<string, number>>;
  capIcu: number | null;
}

export interface PlannedStage {
  stage: AudioStageId;
  label: string;
  task: TaskName;
  /** Stage-local lineage inputs (asset refs / transcript revision keys). */
  lineageInputs: readonly string[];
  estimate: AudioStageEstimate;
}

export interface AudioStagePlan {
  kind: AudioJobKind;
  stages: readonly PlannedStage[];
  estimate: AudioJobEstimate;
}

const BCP47 = /^[a-z]{2,3}(-[A-Z]{2})?$/;

function assertLocale(tag: string | null, field: string): void {
  if (tag === null) return;
  if (!BCP47.test(tag)) {
    throw audioError("AUDIO_LOCALE_UNSUPPORTED", `${field} must be a BCP-47 tag such as 'en' or 'en-US'.`, { [field]: tag });
  }
}

function stagesFor(kind: AudioJobKind): readonly AudioStageId[] {
  switch (kind) {
    case "tts":
      return ["synthesize"];
    case "transcribe":
      return ["transcribe"];
    case "changer":
      return ["transcribe", "mix"];
    case "dub":
      return [...AUDIO_STAGE_IDS];
    default:
      throw audioError("AUDIO_VALIDATION", `Unknown audio job kind.`, { kind });
  }
}

/**
 * Build the stage plan for an audio job. Dub runs the full
 * transcribe→translate→synthesize→align→mix composition; every stage
 * carries explicit lineage inputs and an explicit estimate. Changer
 * transcribes for alignment reference, then transforms. Stages the
 * endpoint cannot serve (locale outside its attested list, or no
 * qualified capability at all) fail closed here — never as silent
 * fallback at dispatch.
 */
export function buildAudioStagePlan(input: StagePlanInput): AudioStagePlan {
  if (!(AUDIO_JOB_KINDS as readonly string[]).includes(input.kind)) {
    throw audioError("AUDIO_VALIDATION", "Unknown audio job kind.", { kind: input.kind });
  }
  assertLocale(input.sourceLanguage, "sourceLanguage");
  assertLocale(input.targetLanguage, "targetLanguage");
  if (input.kind === "dub") {
    if (!input.targetLanguage) {
      throw audioError("AUDIO_VALIDATION", "Dubbing requires an explicit target language.", {});
    }
    if (input.sourceLanguage && input.sourceLanguage === input.targetLanguage) {
      throw audioError("AUDIO_VALIDATION", "Dub source and target languages must differ.", {
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
      });
    }
  }
  if (input.endpointLocales.length === 0) {
    throw audioError("AUDIO_CAPABILITY_UNQUALIFIED", "No qualified audio capability serves this request.", {
      kind: input.kind,
    });
  }
  for (const tag of [input.sourceLanguage, input.targetLanguage]) {
    if (tag !== null && !input.endpointLocales.includes(tag)) {
      throw audioError("AUDIO_LOCALE_UNSUPPORTED", `Locale ${tag} is not served by the resolved capability.`, {
        locale: tag,
      });
    }
  }

  const stages: PlannedStage[] = stagesFor(input.kind).map((stage, index) => {
    const task = AUDIO_STAGE_TASKS[stage];
    const units = input.unitsPerStage[stage] ?? 0;
    if (!Number.isFinite(units) || units <= 0) {
      throw audioError("AUDIO_VALIDATION", `Stage ${stage} needs a positive billable-unit estimate.`, { stage });
    }
    const estimatedIcu = Math.max(1, Math.ceil(units * input.icuPerUnit));
    const lineageInputs = index === 0 ? ["source-asset"] : [`stage:${stagesFor(input.kind)[index - 1]}:output`];
    return {
      stage,
      label: AUDIO_STAGE_LABELS[stage],
      task,
      lineageInputs,
      estimate: {
        stage,
        task,
        meterUnit: input.meterUnit,
        meterQuantity: units,
        estimatedIcu,
        capIcu: input.capIcu,
      },
    };
  });

  const totalEstimatedIcu = stages.reduce((sum, stage) => sum + stage.estimate.estimatedIcu, 0);
  return {
    kind: input.kind,
    stages,
    estimate: {
      kind: input.kind,
      stages: stages.map((stage) => stage.estimate),
      totalEstimatedIcu,
      currencyNote: "Estimates in integer ICU; each stage settles exactly once against its own quote.",
    },
  };
}

/** Stages that must rerun when `fromStage` is retried (itself + downstream). */
export function dirtyDownstreamStages(plan: AudioStagePlan, fromStage: AudioStageId): readonly AudioStageId[] {
  const order = plan.stages.map((stage) => stage.stage);
  const index = order.indexOf(fromStage);
  if (index < 0) throw audioError("AUDIO_VALIDATION", `Stage ${fromStage} is not in this plan.`, { fromStage });
  return order.slice(index);
}
