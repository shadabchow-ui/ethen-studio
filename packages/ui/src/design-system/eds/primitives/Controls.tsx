import * as React from "react";

export interface EdsCheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
  error?: string;
}

function useFieldIds(idProp: string | undefined, prefix: string) {
  const generated = React.useId();
  const id = idProp ?? `${prefix}-${generated.replace(/[^a-zA-Z0-9]/g, "")}`;
  return id;
}

function FieldHelp({ id, description, error }: { id: string; description?: string; error?: string }) {
  const descriptionId = description && !error ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <>
      {!error && description ? (
        <p className="eds-description" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p className="eds-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function describedBy(id: string, description?: string, error?: string): string | undefined {
  const parts = [description && !error ? `${id}-description` : null, error ? `${id}-error` : null].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export const EdsCheckbox = React.forwardRef<HTMLInputElement, EdsCheckboxProps>(
  ({ label, description, error, id: idProp, disabled, className, ...props }, ref) => {
    const id = useFieldIds(idProp, "eds-checkbox");
    return (
      <div className="eds-field">
        <div className="eds-check">
          <input
            ref={ref}
            id={id}
            type="checkbox"
            className={["eds-check__input", className].filter(Boolean).join(" ")}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, description, error)}
            {...props}
          />
          <label className="eds-label eds-check__label" htmlFor={id}>
            {label}
          </label>
        </div>
        <FieldHelp id={id} description={description} error={error} />
      </div>
    );
  },
);
EdsCheckbox.displayName = "EdsCheckbox";

export interface EdsRadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
  error?: string;
}

export const EdsRadio = React.forwardRef<HTMLInputElement, EdsRadioProps>(
  ({ label, description, error, id: idProp, disabled, className, ...props }, ref) => {
    const id = useFieldIds(idProp, "eds-radio");
    return (
      <div className="eds-field">
        <div className="eds-check">
          <input
            ref={ref}
            id={id}
            type="radio"
            className={["eds-check__input eds-check__input--radio", className].filter(Boolean).join(" ")}
            disabled={disabled}
            aria-describedby={describedBy(id, description, error)}
            {...props}
          />
          <label className="eds-label eds-check__label" htmlFor={id}>
            {label}
          </label>
        </div>
        <FieldHelp id={id} description={description} error={error} />
      </div>
    );
  },
);
EdsRadio.displayName = "EdsRadio";

export interface EdsSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const EdsSwitch = React.forwardRef<HTMLButtonElement, EdsSwitchProps>(
  ({ label, checked, onChange, description, error, disabled, id: idProp, className }, ref) => {
    const id = useFieldIds(idProp, "eds-switch");
    const labelId = `${id}-label`;
    const descriptionId = description && !error ? `${id}-description` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const described = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="eds-field">
        <div className="eds-switch">
          <button
            ref={ref}
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-labelledby={labelId}
            aria-invalid={error ? true : undefined}
            aria-describedby={described}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={["eds-switch__track", checked ? "eds-switch__track--on" : "", className]
              .filter(Boolean)
              .join(" ")}
          >
            <span aria-hidden className="eds-switch__thumb" />
          </button>
          <span className="eds-label eds-switch__label" id={labelId}>
            {label}
          </span>
        </div>
        <FieldHelp id={id} description={description} error={error} />
      </div>
    );
  },
);
EdsSwitch.displayName = "EdsSwitch";
