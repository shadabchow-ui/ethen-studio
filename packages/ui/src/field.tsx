import * as React from "react";
import { cn } from "./lib/utils";
import { V2Select } from "./design-system/v2/Select";
import v2 from "./design-system/v2/v2.module.css";

export interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  id?: string;
  className?: string;
  children: React.ReactNode;
}

export function FieldWrapper({ label, hint, error, id, className, children }: FieldWrapperProps) {
  const fieldId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={fieldId} className="text-[11px] font-medium text-[var(--text-tertiary)]">
          {label}
        </label>
      )}
      {children}
      {error && (
        <p className="text-[11px] text-[var(--status-danger)]" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p className="text-[11px] text-[var(--text-tertiary)]">{hint}</p>
      )}
    </div>
  );
}

export interface FieldInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Field = React.forwardRef<HTMLInputElement, FieldInputProps>(
  ({ label, hint, error, className, id, ...props }, ref) => (
    <FieldWrapper label={label} hint={hint} error={error} id={id}>
      <input
        ref={ref}
        id={id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined)}
        className={cn(v2.textInput, v2.textInputMd, error && v2.textInputInvalid, className)}
        aria-invalid={error ? true : undefined}
        {...props}
      />
    </FieldWrapper>
  ),
);
Field.displayName = "Field";

export interface FieldTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const FieldTextarea = React.forwardRef<HTMLTextAreaElement, FieldTextareaProps>(
  ({ label, hint, error, className, id, ...props }, ref) => (
    <FieldWrapper label={label} hint={hint} error={error} id={id}>
      <textarea
        ref={ref}
        id={id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined)}
        className={cn(v2.textArea, v2.textInputMd, error && v2.textAreaInvalid, className)}
        aria-invalid={error ? true : undefined}
        {...props}
      />
    </FieldWrapper>
  ),
);
FieldTextarea.displayName = "FieldTextarea";

export interface FieldSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const FieldSelect = React.forwardRef<HTMLSelectElement, FieldSelectProps>(
  ({ label, hint, error, options, className, id, size: _size, ...props }, ref) => (
    <FieldWrapper label={label} hint={hint} error={error} id={id}>
      <V2Select
        ref={ref}
        id={id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined)}
        className={className}
        invalid={Boolean(error)}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </V2Select>
    </FieldWrapper>
  ),
);
FieldSelect.displayName = "FieldSelect";
