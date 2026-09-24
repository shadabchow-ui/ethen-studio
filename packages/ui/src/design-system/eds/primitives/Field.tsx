import * as React from "react";

export interface EdsFieldShellProps {
  id: string;
  label?: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}

export function EdsFieldShell({ id, label, description, error, children }: EdsFieldShellProps) {
  const descriptionId = description && !error ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="eds-field">
      {label ? (
        <label className="eds-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
              id,
              "aria-invalid": error ? true : undefined,
              "aria-describedby": describedBy,
            })
          : child,
      )}
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
    </div>
  );
}

export interface EdsInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
}

export const EdsInput = React.forwardRef<HTMLInputElement, EdsInputProps>(
  ({ label, description, error, id: idProp, className, ...props }, ref) => {
    const generated = React.useId();
    const id = idProp ?? `eds-input-${generated.replace(/[^a-zA-Z0-9]/g, "")}`;
    return (
      <EdsFieldShell id={id} label={label} description={description} error={error}>
        <input ref={ref} className={["eds-input", className].filter(Boolean).join(" ")} {...props} />
      </EdsFieldShell>
    );
  },
);
EdsInput.displayName = "EdsInput";

export interface EdsTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  description?: string;
  error?: string;
}

export const EdsTextarea = React.forwardRef<HTMLTextAreaElement, EdsTextareaProps>(
  ({ label, description, error, id: idProp, className, ...props }, ref) => {
    const generated = React.useId();
    const id = idProp ?? `eds-textarea-${generated.replace(/[^a-zA-Z0-9]/g, "")}`;
    return (
      <EdsFieldShell id={id} label={label} description={description} error={error}>
        <textarea ref={ref} className={["eds-textarea", className].filter(Boolean).join(" ")} {...props} />
      </EdsFieldShell>
    );
  },
);
EdsTextarea.displayName = "EdsTextarea";
