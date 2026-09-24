interface StudioReferencePanelProps {
  label: string;
  hint: string;
  disabled?: boolean;
  uploadState?: "idle" | "uploading" | "uploaded" | "error";
  uploadError?: string | null;
  previewUrl?: string | null;
  referenceTitle?: string | null;
  detailText?: string | null;
  onFileSelect?: (file: File) => void;
  imageUrlValue?: string;
  onImageUrlChange?: (value: string) => void;
}

export function StudioReferencePanel({
  label,
  hint,
  disabled = false,
  uploadState = "idle",
  uploadError,
  previewUrl,
  referenceTitle,
  detailText,
  onFileSelect,
  imageUrlValue,
  onImageUrlChange,
}: StudioReferencePanelProps) {
  const showUrlInput = typeof onImageUrlChange === "function";
  const uploadStatusLabel =
    uploadState === "uploading"
      ? "Uploading reference…"
      : uploadState === "uploaded"
        ? "Stored in local private-beta media storage."
        : uploadState === "error"
          ? "Upload failed."
          : disabled
            ? "Upload is stored for later reuse in this private beta."
            : "PNG, JPEG, WEBP, or GIF up to 8MB.";

  return (
    <section className="ethen-panel-smoked-quiet space-y-3 rounded-[20px] px-4 py-4">
      <h2 className="text-[12px] font-medium text-[var(--text-secondary)] tracking-wide">{label}</h2>
      <div className="rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-4">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={referenceTitle ?? "Reference preview"}
            className="mb-3 h-28 w-full rounded-[12px] object-cover"
          />
        ) : null}
        <p className="text-[12px] text-[var(--text-secondary)]">{hint}</p>
        <p className="mt-2 text-[11px] text-[var(--text-secondary)]">{uploadStatusLabel}</p>
        {referenceTitle ? <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{referenceTitle}</p> : null}
        {detailText ? <p className="mt-1 break-all text-[11px] text-[var(--text-tertiary)]">{detailText}</p> : null}
        {uploadError ? <p className="mt-1 text-[11px] text-[var(--text-primary)]">{uploadError}</p> : null}
      </div>
      <label className="flex cursor-pointer items-center justify-center rounded-[10px] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFileSelect?.(file);
            event.currentTarget.value = "";
          }}
        />
        Choose image
      </label>
      {showUrlInput ? (
        <div className="space-y-1.5">
          <label htmlFor="studio-reference-image-url" className="text-[11px] text-[var(--text-secondary)]">
            public image URL fallback
          </label>
          <input
            id="studio-reference-image-url"
            type="text"
            value={imageUrlValue ?? ""}
            onChange={(event) => onImageUrlChange?.(event.target.value)}
            placeholder="https://example.com/source-image.jpg"
            className="w-full rounded-[10px] bg-[var(--bg-surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:bg-[var(--bg-elevated)]"
          />
          <p className="text-[11px] text-[var(--text-tertiary)]">
            Local uploads work inside Studio in this private beta. Keep a public URL here for provider flows that need one.
          </p>
        </div>
      ) : null}
    </section>
  );
}
