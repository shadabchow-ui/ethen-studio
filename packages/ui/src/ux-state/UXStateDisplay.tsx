/**
 * UXStateDisplay — Renders truthful empty, loading, error, offline, and recovery states.
 *
 * FE-03: Every product route must render these states instead of blank pages
 * or decorative placeholders. These are pure-presentation components that
 * show the state message without hiding backend failures.
 */

import type { UXStateProps } from "../lib/ux-state";

export function LoadingState({ productName, message }: UXStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4" role="status" aria-label={`${productName} loading`}>
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">{message ?? `Loading ${productName.toLowerCase()}...`}</p>
    </div>
  );
}

export function EmptyState({ productName, message, actionLabel, onAction }: UXStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4" role="status" aria-label={`${productName} empty`}>
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 12h6M12 9v6" />
        </svg>
      </div>
      <p className="text-sm text-muted-foreground max-w-md">{message ?? `No ${productName.toLowerCase()} data yet.`}</p>
      {actionLabel && onAction && (
        <button className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorState({ productName, message, actionLabel, onAction }: UXStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4" role="alert" aria-label={`${productName} error`}>
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-destructive">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h0" />
        </svg>
      </div>
      <p className="text-sm text-destructive/90 max-w-md">{message ?? `Something went wrong with ${productName.toLowerCase()}.`}</p>
      {actionLabel && onAction && (
        <button className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function OfflineState({ productName, message }: UXStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4" role="status" aria-label={`${productName} offline`}>
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <path d="M1 1l22 22M16.72 11.06A10.95 10.95 0 0119 12.55" />
          <path d="M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9" />
          <path d="M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0" />
          <path d="M12 20h0" />
        </svg>
      </div>
      <p className="text-sm text-muted-foreground max-w-md">{message ?? `Network connection required for ${productName.toLowerCase()}.`}</p>
    </div>
  );
}

export function RecoveryState({ productName, message }: UXStateProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4" role="status" aria-label={`${productName} recovery`}>
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
      <p className="text-sm text-muted-foreground">{message ?? `Recovering ${productName.toLowerCase()} session...`}</p>
    </div>
  );
}

/**
 * Render the appropriate UX state component based on the state kind.
 */
export function UXStateDisplay(props: UXStateProps) {
  switch (props.kind) {
    case "loading": return <LoadingState {...props} />;
    case "empty": return <EmptyState {...props} />;
    case "error": return <ErrorState {...props} />;
    case "offline": return <OfflineState {...props} />;
    case "recovery": return <RecoveryState {...props} />;
  }
}
