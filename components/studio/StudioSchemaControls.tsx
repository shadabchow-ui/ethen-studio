"use client";

/**
 * Studio V3 Job 2 — lazy schema inspector (schema-to-control renderer).
 *
 * Renders adapted endpoint controls with shared settings primitives: enums,
 * booleans, bounded numbers, strings, media refs, nested groups and
 * conditionals (via required/visible inputs), endpoint defaults and required
 * validation. Unsupported constructs render explicitly disabled with reasons;
 * unsupported REQUIRED inputs block the form. Advanced raw parameters pass
 * through only for supported fields (dropped names are listed, never sent).
 */

import * as React from "react";
import {
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsTextField,
  SettingsToggle,
} from "@ethen/ui/settings/index";
import {
  filterRawParams,
  validateControlValues,
  type AdaptedControls,
  type ControlDef,
} from "../../lib/media/schema-store";

function ControlField({
  control,
  value,
  error,
  onChange,
}: {
  control: ControlDef;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const detail = error ?? (control.required ? "Required" : undefined);
  if (control.kind === "unsupported") {
    return (
      <SettingsRow
        title={control.label}
        detail={control.unsupportedReason ?? "unsupported"}
        action={<SettingsToggle label={control.label} checked={false} disabled disabledReason={control.unsupportedReason ?? "unsupported"} onChange={() => {}} />}
      />
    );
  }
  if (control.kind === "enum") {
    return (
      <SettingsSelect
        id={`sc-${control.name}`}
        label={control.label}
        value={typeof value === "string" ? value : ""}
        detail={detail}
        onChange={(next) => onChange(next)}
        options={(control.enumValues ?? []).map((option) => ({ value: option, label: option }))}
      />
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
  if (control.kind === "number") {
    const bounds = [
      control.min !== undefined ? `min ${control.min}` : null,
      control.max !== undefined ? `max ${control.max}` : null,
    ].filter(Boolean).join(" · ");
    return (
      <SettingsTextField
        id={`sc-${control.name}`}
        label={control.label}
        value={value === undefined || value === null ? "" : String(value)}
        detail={[detail, bounds].filter(Boolean).join(" — ") || undefined}
        onChange={(next) => onChange(next === "" ? undefined : Number(next))}
      />
    );
  }
  if (control.kind === "media-ref") {
    return (
      <SettingsTextField
        id={`sc-${control.name}`}
        label={`${control.label} (${(control.mediaKinds ?? ["media"]).join("/")})`}
        value={typeof value === "string" ? value : ""}
        detail={detail ?? "Asset reference or URL"}
        onChange={(next) => onChange(next)}
      />
    );
  }
  if (control.kind === "nested") {
    const group = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    return (
      <fieldset>
        <legend>{control.label}</legend>
        {(control.children ?? []).map((child) => (
          <ControlField
            key={child.name}
            control={child}
            value={group[child.name]}
            error={error ? `${error} (${child.name})` : undefined}
            onChange={(childValue) => onChange({ ...group, [child.name]: childValue })}
          />
        ))}
      </fieldset>
    );
  }
  return (
    <SettingsTextField
      id={`sc-${control.name}`}
      label={control.label}
      value={typeof value === "string" ? value : ""}
      detail={detail}
      onChange={(next) => onChange(next)}
    />
  );
}

export function StudioSchemaControls({
  endpointId,
  adapted,
  values,
  onChange,
}: {
  endpointId: string;
  adapted: AdaptedControls;
  values: Readonly<Record<string, unknown>>;
  onChange: (values: Readonly<Record<string, unknown>>) => void;
}) {
  const [raw, setRaw] = React.useState("");
  const [rawError, setRawError] = React.useState<string | null>(null);
  const [dropped, setDropped] = React.useState<readonly string[]>([]);
  const validation = React.useMemo(() => validateControlValues(adapted, values), [adapted, values]);
  const blocked = adapted.blockingUnsupported.length > 0;

  const applyRaw = React.useCallback(() => {
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
    const { params, dropped: droppedNames } = filterRawParams(adapted, parsed as Record<string, unknown>);
    setDropped(droppedNames);
    setRawError(null);
    onChange({ ...values, ...params });
  }, [raw, adapted, values, onChange]);

  return (
    <SettingsSection
      id={`schema-${endpointId}`}
      title={`Parameters — ${endpointId}`}
      meta={blocked ? "Blocked: required inputs this schema cannot represent." : "Endpoint inputs from the verified schema."}
    >
      {blocked ? (
        <SettingsRow
          title="Unsupported required inputs"
          detail={adapted.blockingUnsupported.join(", ")}
          action={<SettingsToggle label="Blocked" checked={false} disabled disabledReason="required inputs are not representable" onChange={() => {}} />}
        />
      ) : null}
      {adapted.controls.map((control) => (
        <ControlField
          key={control.name}
          control={control}
          value={values[control.name]}
          error={validation.errors[control.name]}
          onChange={(value) => onChange({ ...values, [control.name]: value })}
        />
      ))}
      <SettingsTextField
        id={`sc-raw-${endpointId}`}
        label="Advanced parameters (JSON)"
        value={raw}
        detail={rawError ?? (dropped.length > 0 ? `Dropped unsupported: ${dropped.join(", ")}` : "Only supported fields are kept.")}
        onChange={(next) => setRaw(next)}
      />
      <SettingsRow
        title="Apply advanced parameters"
        detail={validation.ok ? "Current values validate." : "Fix validation errors before generating."}
        action={<button type="button" onClick={applyRaw}>Apply</button>}
      />
    </SettingsSection>
  );
}
