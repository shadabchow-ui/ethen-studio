/**
 * STUDIO_09 — V5 schema controls.
 *
 * Renders essential endpoint parameters from the qualified EndpointSpec
 * JSON schema with Advanced raw provider_params behind a drawer. Unknown
 * required controls disable execution with an explanation; unsupported
 * optional constructs render disabled with reasons. Parameter truth comes
 * from @ethen/studio-core/catalog validation — never regex inference.
 */

"use client";

import * as React from "react";
import { SettingsRow, SettingsToggle } from "@ethen/ui/settings/index";
import {
  validateCoreParameters,
  validateRawProviderParameters,
  type EndpointSpec,
} from "@ethen/studio-core/catalog";

export type SchemaControlKind = "string" | "enum" | "number" | "integer" | "boolean" | "unsupported";

export interface SchemaControlView {
  name: string;
  label: string;
  kind: SchemaControlKind;
  required: boolean;
  advanced: boolean;
  enumValues: readonly string[] | null;
  min: number | null;
  max: number | null;
  defaultValue: unknown;
  unsupportedReason: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Adapt an endpoint JSON schema to renderable controls. Objects, arrays
 * (except enums), and union types are unsupported constructs: required
 * ones block the form, optional ones render disabled with reasons.
 */
export function adaptSchemaControls(spec: EndpointSpec): { controls: SchemaControlView[]; blocking: string[] } {
  const properties = asRecord(spec.jsonSchema.properties);
  const required = Array.isArray(spec.jsonSchema.required)
    ? (spec.jsonSchema.required as unknown[]).filter((entry): entry is string => typeof entry === "string")
    : [];
  const controls: SchemaControlView[] = [];
  for (const name of spec.supportedControls) {
    const declared = asRecord(properties[name]);
    const requiredControl = required.includes(name) || spec.requiredControls.includes(name);
    const entry: SchemaControlView = {
      name,
      label: typeof declared.title === "string" ? declared.title : name,
      kind: "string",
      required: requiredControl,
      advanced: name === "provider_params" || (declared["x-advanced"] === true),
      enumValues: null,
      min: null,
      max: null,
      defaultValue: declared.default,
      unsupportedReason: null,
    };
    if (name === "provider_params") {
      entry.kind = "unsupported";
      entry.unsupportedReason = "Raw provider parameters are edited in the Advanced drawer.";
    } else if (Array.isArray(declared.enum) && declared.enum.length > 0) {
      entry.kind = "enum";
      entry.enumValues = declared.enum.filter((option): option is string => typeof option === "string");
    } else if (declared.type === "boolean") {
      entry.kind = "boolean";
    } else if (declared.type === "integer" || declared.type === "number") {
      entry.kind = declared.type;
      entry.min = typeof declared.minimum === "number" ? declared.minimum : null;
      entry.max = typeof declared.maximum === "number" ? declared.maximum : null;
    } else if (declared.type === "string" || declared.type === undefined) {
      entry.kind = "string";
    } else {
      entry.kind = "unsupported";
      entry.unsupportedReason = `Type “${String(declared.type)}” has no Studio control.`;
    }
    controls.push(entry);
  }
  const blocking = controls
    .filter((control) => control.kind === "unsupported" && control.required && control.name !== "provider_params")
    .map((control) => control.name);
  for (const control of spec.requiredControls) {
    if (!spec.supportedControls.includes(control) && !blocking.includes(control)) {
      blocking.push(control);
    }
  }
  return { controls, blocking };
}

/*
 * Presentation (M3B): the inspector grammar of the approved generator —
 * 11px tracked labels, 9px-radius segmented controls for short enums
 * (aspect ratio 5-up), compact selects laid out 2-up, and slider styling
 * for bounded strengths. Values and onChange semantics are unchanged.
 */
const LABEL_CLASS = "text-[11.5px] font-medium leading-none text-[var(--text-tertiary)]";
const INPUT_CLASS =
  "w-full min-h-[44px] rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-[11px] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50 pointer-fine:min-h-[34px] focus-visible:outline-2! focus-visible:outline-solid! focus-visible:outline-offset-2! focus-visible:outline-[var(--studio-focus)]!";
const SEGMENT_CLASS =
  "min-h-[44px] rounded-[9px] border px-1 text-[11.5px] transition-colors pointer-fine:min-h-[30px] focus-visible:outline-2! focus-visible:outline-solid! focus-visible:outline-offset-2! focus-visible:outline-[var(--studio-focus)]!";

/** Short enums (aspect ratios, counts) render as a segmented control. */
export function isSegmentedEnum(control: SchemaControlView): boolean {
  const options = control.enumValues ?? [];
  return control.kind === "enum" && options.length >= 2 && options.length <= 10 && options.every((option) => option.length <= 6);
}

/** Bounded unit-interval numbers (strengths, weights) render as sliders. */
export function isSliderNumber(control: SchemaControlView): boolean {
  return control.kind === "number" && control.min !== null && control.max !== null && control.max > control.min && control.max - control.min <= 1;
}

function FieldHead({ htmlFor, label, detail, value }: { htmlFor?: string; label: string; detail?: string; value?: string }) {
  return (
    <div className="mb-[9px] flex items-baseline justify-between gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={LABEL_CLASS}>{label}</label>
      ) : (
        <span className={LABEL_CLASS}>{label}</span>
      )}
      {value !== undefined ? <span className="font-mono text-[11.5px] text-[var(--text-primary)]">{value}</span> : null}
      {detail && value === undefined ? <small className="truncate text-[11px] text-[var(--text-tertiary)]">{detail}</small> : null}
    </div>
  );
}

function ControlField({
  control,
  value,
  error,
  onChange,
}: {
  control: SchemaControlView;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const detail = error ?? (control.required ? "Required" : undefined);
  const id = `v5-sc-${control.name}`;
  if (control.kind === "unsupported") {
    return (
      <SettingsRow
        title={control.label}
        detail={control.unsupportedReason ?? "unsupported"}
        action={
          <SettingsToggle label={control.label} checked={false} disabled disabledReason={control.unsupportedReason ?? "unsupported"} onChange={() => {}} />
        }
      />
    );
  }
  if (control.kind === "enum" && isSegmentedEnum(control)) {
    const options = control.enumValues ?? [];
    return (
      <div>
        <FieldHead label={control.label} detail={detail} />
        <div role="radiogroup" aria-label={control.label} id={id} className={`grid gap-1.5 ${options.length >= 5 ? "grid-cols-5" : options.length === 4 ? "grid-cols-4" : options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {options.map((option) => {
            const checked = value === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => onChange(option)}
                className={`${SEGMENT_CLASS} ${checked ? "border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"}`}
              >
                {option}
              </button>
            );
          })}
        </div>
        {error ? <p className="mt-1.5 text-[11px] text-[var(--text-primary)]">{error}</p> : null}
      </div>
    );
  }
  if (control.kind === "enum") {
    return (
      <div className="min-w-0">
        <FieldHead htmlFor={id} label={control.label} detail={detail} />
        <select id={id} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className={`${INPUT_CLASS} appearance-none bg-no-repeat pr-7 [background-image:linear-gradient(45deg,transparent_50%,var(--text-tertiary)_50%),linear-gradient(135deg,var(--text-tertiary)_50%,transparent_50%)] [background-position:calc(100%-15px)_52%,calc(100%-11px)_52%] [background-size:4px_4px,4px_4px]`}>
          {(control.enumValues ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
    );
  }
  if (control.kind === "boolean") {
    return (
      <SettingsRow
        title={control.label}
        detail={detail}
        action={<SettingsToggle label={control.label} checked={value === true} onChange={(next) => onChange(next)} />}
      />
    );
  }
  if (control.kind === "number" || control.kind === "integer") {
    if (isSliderNumber(control)) {
      const min = control.min ?? 0;
      const max = control.max ?? 1;
      const current = typeof value === "number" ? value : typeof control.defaultValue === "number" ? control.defaultValue : null;
      const percent = current === null ? 0 : ((current - min) / (max - min)) * 100;
      return (
        <div>
          <FieldHead htmlFor={id} label={control.label} value={current === null ? "Default" : current.toFixed(2)} />
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={(max - min) / 100}
            value={current ?? min}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => onChange(Number(event.target.value))}
            style={{ "--fill": `${percent}%` } as React.CSSProperties}
            className="h-5 w-full cursor-pointer appearance-none bg-transparent pointer-coarse:h-11 focus-visible:outline-2! focus-visible:outline-solid! focus-visible:outline-offset-2! focus-visible:outline-[var(--studio-focus)]! [&::-moz-range-thumb]:h-[11px] [&::-moz-range-thumb]:w-[11px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--text-primary)] [&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[var(--bg-elevated)] [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--text-secondary)_var(--fill),var(--bg-elevated)_var(--fill))] [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-[11px] [&::-webkit-slider-thumb]:w-[11px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--text-primary)]"
          />
          {error ? <p id={`${id}-error`} className="mt-1 text-[11px] text-[var(--text-primary)]">{error}</p> : null}
        </div>
      );
    }
    const bounds = [
      control.min !== null ? `min ${control.min}` : null,
      control.max !== null ? `max ${control.max}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div className="min-w-0">
        <FieldHead htmlFor={id} label={control.label} detail={[detail, bounds].filter(Boolean).join(" — ") || undefined} />
        <input
          id={id}
          inputMode={control.kind === "integer" ? "numeric" : "decimal"}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "") {
              onChange(undefined);
              return;
            }
            onChange(control.kind === "integer" ? Number.parseInt(next, 10) : Number(next));
          }}
          className={`${INPUT_CLASS} font-mono`}
        />
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <FieldHead htmlFor={id} label={control.label} detail={detail} />
      <input id={id} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className={INPUT_CLASS} />
    </div>
  );
}

/** Wide controls take the full inspector width; compact ones pair 2-up. */
function isCompactControl(control: SchemaControlView): boolean {
  return (control.kind === "enum" && !isSegmentedEnum(control)) || control.kind === "integer" || (control.kind === "number" && !isSliderNumber(control));
}

/** Pairs consecutive compact controls into 2-up rows, keeping schema order. */
function groupControls(controls: readonly SchemaControlView[]): SchemaControlView[][] {
  const groups: SchemaControlView[][] = [];
  for (const control of controls) {
    const last = groups[groups.length - 1];
    if (isCompactControl(control) && last && last.length === 1 && isCompactControl(last[0]!)) last.push(control);
    else groups.push([control]);
  }
  return groups;
}

export function CreateSchemaControls({
  spec,
  values,
  onChange,
  onValidityChange,
}: {
  spec: EndpointSpec | null;
  values: Readonly<Record<string, unknown>>;
  onChange: (values: Readonly<Record<string, unknown>>) => void;
  onValidityChange?: (valid: boolean, problems: readonly string[]) => void;
}) {
  const [raw, setRaw] = React.useState("");
  const [rawError, setRawError] = React.useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const adapted = React.useMemo(() => (spec ? adaptSchemaControls(spec) : null), [spec]);
  const validation = React.useMemo(
    () => (spec ? validateCoreParameters(spec, values) : { ok: true, problems: [] }),
    [spec, values],
  );
  const blocked = (adapted?.blocking.length ?? 0) > 0;
  const valid = !blocked && validation.ok;

  const problems = React.useMemo(() => {
    const out = validation.problems.map((problem) => problem.message);
    if (blocked && adapted) out.unshift(`Unsupported required inputs: ${adapted.blocking.join(", ")}.`);
    return out;
  }, [validation, blocked, adapted]);

  React.useEffect(() => {
    onValidityChange?.(valid, problems);
  }, [valid, problems, onValidityChange]);

  const applyRaw = React.useCallback(() => {
    if (!spec) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      setRawError("Advanced parameters must be valid JSON.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setRawError("Advanced parameters must be a JSON object.");
      return;
    }
    const result = validateRawProviderParameters(spec, parsed as Record<string, unknown>);
    if (!result.ok) {
      setRawError(result.problems.map((problem) => problem.message).join(" "));
      return;
    }
    setRawError(null);
    onChange({ ...values, provider_params: parsed });
  }, [raw, spec, values, onChange]);

  if (!spec || !adapted) {
    return (
      <p role="status" className="rounded-[11px] border border-dashed border-[var(--border-default)] px-3 py-3 text-[12px] text-[var(--text-secondary)]">
        Select a model to load its verified parameters.
      </p>
    );
  }

  const essential = adapted.controls.filter((control) => !control.advanced && control.name !== "provider_params");

  return (
    <div className="space-y-3">
      <div role="group" aria-label={`Parameters — ${spec.label}`} id={`v5-schema-${spec.endpointId}`} className="space-y-[18px]">
        <p className="text-[11.5px] leading-[1.45] text-[var(--text-tertiary)]">
          {blocked ? "Blocked: required inputs this schema cannot represent." : "Endpoint inputs from the verified schema."}
        </p>
        {blocked ? (
          <SettingsRow
            title="Unsupported required inputs"
            detail={adapted.blocking.join(", ")}
            action={<SettingsToggle label="Blocked" checked={false} disabled disabledReason="required inputs are not representable" onChange={() => {}} />}
          />
        ) : null}
        {groupControls(essential).map((group) =>
          group.length === 2 ? (
            <div key={group.map((control) => control.name).join("+")} className="grid grid-cols-2 gap-3">
              {group.map((control) => (
                <ControlField
                  key={control.name}
                  control={control}
                  value={values[control.name]}
                  error={validation.problems.find((problem) => problem.control === control.name)?.message}
                  onChange={(value) => onChange({ ...values, [control.name]: value })}
                />
              ))}
            </div>
          ) : (
            <ControlField
              key={group[0]!.name}
              control={group[0]!}
              value={values[group[0]!.name]}
              error={validation.problems.find((problem) => problem.control === group[0]!.name)?.message}
              onChange={(value) => onChange({ ...values, [group[0]!.name]: value })}
            />
          ),
        )}
      </div>
      <details
        className="rounded-[11px] border border-[var(--border-default)] px-3 py-2"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-[32px] cursor-pointer items-center text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Advanced parameters
        </summary>
        <div className="space-y-2 pb-2 pt-2">
          <label htmlFor={`v5-raw-${spec.endpointId}`} className="text-[12px] text-[var(--text-secondary)]">
            Raw provider parameters (JSON) — only allowlisted names are kept.
          </label>
          <textarea
            id={`v5-raw-${spec.endpointId}`}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={3}
            placeholder='{"temperature": 0.7}'
            className="w-full rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-inset)] px-3 py-2 font-mono text-[12px] text-[var(--text-primary)]"
          />
          {rawError ? (
            <p role="alert" className="text-[12px] text-[var(--text-primary)]">
              {rawError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={applyRaw}
            className="min-h-[32px] rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3.5 text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]"
          >
            Apply advanced parameters
          </button>
        </div>
      </details>
    </div>
  );
}
