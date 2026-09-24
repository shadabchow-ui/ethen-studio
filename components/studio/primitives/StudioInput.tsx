"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type StudioInputState =
  | "default"
  | "focused"
  | "error"
  | "disabled"
  | "loading";

interface StudioInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  state?: StudioInputState;
  label?: string;
  errorMessage?: string;
  icon?: React.ReactNode;
  wrapperClassName?: string;
}

export const StudioInput = React.forwardRef<HTMLInputElement, StudioInputProps>(
  ({
    state = "default",
    label,
    errorMessage,
    icon,
    className,
    wrapperClassName,
    id,
    ...props
  }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const isError = state === "error";
    const isDisabled = state === "disabled";

    return (
      <div className={cn("space-y-1.5", wrapperClassName)}>
        {label ? (
          <label
            htmlFor={inputId}
            className="block text-[11.5px] font-medium text-[var(--text-secondary)]"
          >
            {label}
          </label>
        ) : null}
        <div className="relative">
          {icon ? (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
              {icon}
            </span>
          ) : null}
          <input
            ref={ref}
            id={inputId}
            disabled={isDisabled}
            className={cn(
              "w-full bg-transparent text-[13px] text-[var(--text-primary)]",
              "placeholder:text-[var(--text-disabled)]",
              "transition duration-100 ease-out",
              "focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-40",
              "rounded-[10px] border px-3 py-2",
              "border-[var(--border-default)] bg-[var(--bg-surface)]",
              "hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]",
              "focus:border-[var(--border-strong)] focus:bg-[var(--bg-elevated)] focus:ring-2 focus:ring-[var(--border-strong)]",
              isError && "border-[var(--status-danger)]/50 focus:border-[var(--status-danger)]/60 focus:ring-[var(--status-danger)]/30",
              icon ? "pl-9" : "",
              className,
            )}
            {...props}
          />
        </div>
        {isError && errorMessage ? (
          <p className="text-[11px] text-[var(--status-danger)]">{errorMessage}</p>
        ) : null}
      </div>
    );
  },
);
StudioInput.displayName = "StudioInput";

interface StudioTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  state?: StudioInputState;
  label?: string;
  errorMessage?: string;
  wrapperClassName?: string;
}

export const StudioTextarea = React.forwardRef<HTMLTextAreaElement, StudioTextareaProps>(
  ({
    state = "default",
    label,
    errorMessage,
    className,
    wrapperClassName,
    id,
    ...props
  }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const isError = state === "error";
    const isDisabled = state === "disabled";

    return (
      <div className={cn("space-y-1.5", wrapperClassName)}>
        {label ? (
          <label
            htmlFor={inputId}
            className="block text-[11.5px] font-medium text-[var(--text-secondary)]"
          >
            {label}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={inputId}
          disabled={isDisabled}
          className={cn(
            "w-full bg-transparent text-[13px] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-disabled)]",
            "transition duration-100 ease-out",
            "focus:outline-none resize-y",
            "disabled:cursor-not-allowed disabled:opacity-40",
            "rounded-[10px] border px-3 py-2 min-h-[80px]",
            "border-[var(--border-default)] bg-[var(--bg-surface)]",
            "hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]",
            "focus:border-[var(--border-strong)] focus:bg-[var(--bg-elevated)] focus:ring-2 focus:ring-[var(--border-strong)]",
            isError && "border-[var(--status-danger)]/50 focus:border-[var(--status-danger)]/60 focus:ring-[var(--status-danger)]/30",
            className,
          )}
          {...props}
        />
        {isError && errorMessage ? (
          <p className="text-[11px] text-[var(--status-danger)]">{errorMessage}</p>
        ) : null}
      </div>
    );
  },
);
StudioTextarea.displayName = "StudioTextarea";
