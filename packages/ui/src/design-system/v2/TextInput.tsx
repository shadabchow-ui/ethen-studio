"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import styles from "./v2.module.css";

export type V2TextInputSize = "sm" | "md" | "lg";

const sizeClass: Record<V2TextInputSize, string> = {
  sm: styles.textInputSm,
  md: styles.textInputMd,
  lg: styles.textInputLg,
};

export interface V2TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: V2TextInputSize;
  invalid?: boolean;
}

export const V2TextInput = forwardRef<HTMLInputElement, V2TextInputProps>(
  ({ className, size = "md", invalid, disabled, readOnly, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(styles.textInput, sizeClass[size], invalid && styles.textInputInvalid, readOnly && styles.textInputReadonly, className)}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      readOnly={readOnly}
      {...props}
    />
  ),
);
V2TextInput.displayName = "V2TextInput";