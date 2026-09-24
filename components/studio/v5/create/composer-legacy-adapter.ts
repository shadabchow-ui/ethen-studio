/**
 * STUDIO_M3A — composer legacy adapter (pure, browser-safe).
 *
 * Maps each frame's existing state shape onto the one
 * GeneratorComposer submit model, preserving the historical submit
 * labels, tooltips, and disabled logic exactly. Frames own their
 * submission journeys; the adapter only translates state to props.
 */

import {
  missingRequiredFields,
  submitTitleFor,
  type ComposerToolEntry,
  type GeneratorRequiredField,
  type GeneratorToolId,
  type RequiredFieldValue,
} from "./composer-registry";
import type { GeneratorSubmitModel } from "./GeneratorComposer";

export interface CreateSubmitState {
  canGenerate: boolean;
  busy: boolean;
  /** Busy phase label (routing/estimating/admitting/running). */
  phaseLabel: string;
  reapprovalRequired: boolean;
}

/** Create lane: phase-aware label, no tooltip, frame-owned validity. */
export function adaptCreateSubmit(
  entry: ComposerToolEntry,
  state: CreateSubmitState,
  onSubmit: () => void,
): GeneratorSubmitModel {
  const label = state.busy
    ? state.phaseLabel
    : state.reapprovalRequired
      ? `Review estimate — ${entry.actionLabel} again to approve`
      : entry.actionLabel;
  return { label, disabled: !state.canGenerate, onSubmit, arrow: true };
}

export interface AudioSubmitState {
  busy: boolean;
  values: Readonly<Record<string, RequiredFieldValue>>;
  /** Extra frame gates beyond required fields (project scope, capability). */
  extraDisabled: boolean;
  /** Capability-blocked tooltip wins over required-field tooltips. */
  blockedMessage: string | null;
}

/** Audio lane: busy label, first-missing-field tooltip, capability gate. */
export function adaptAudioSubmit(
  entry: ComposerToolEntry,
  toolId: GeneratorToolId,
  state: AudioSubmitState,
  onSubmit: () => void,
): { model: GeneratorSubmitModel; missing: readonly GeneratorRequiredField[] } {
  const missing = missingRequiredFields(toolId, state.values);
  const title = state.blockedMessage ?? submitTitleFor(entry, missing);
  const label = state.busy && entry.busyLabel ? entry.busyLabel : entry.actionLabel;
  return {
    model: { label, title, disabled: state.extraDisabled || missing.length > 0, onSubmit },
    missing,
  };
}
