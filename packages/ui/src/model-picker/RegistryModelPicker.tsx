"use client";

import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import {
  movePickerActiveIndex,
  type ModelPickerOption,
} from "@ethen/ai/model-picker";

export function RegistryModelPicker({
  options,
  selectedId,
  onSelect,
  label = "Model and provider",
}: {
  options: readonly ModelPickerOption[];
  selectedId: string | null;
  onSelect: (option: ModelPickerOption) => void;
  label?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.label} ${option.providerLabel} ${option.modelId}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [options, query]);
  const selected = options.find((option) => option.id === selectedId) ?? null;

  function choose(option: ModelPickerOption) {
    if (option.availability === "unavailable") return;
    onSelect(option);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) choose(option);
      return;
    }
    const next = movePickerActiveIndex({
      currentIndex: activeIndex,
      key: event.key,
      optionCount: filtered.length,
    });
    if (next !== activeIndex) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(next);
    }
  }

  return (
    <div className="relative">
      {/* J11B3: explicit EDS ink — bare inheritance split dark-on-dark under light. */}
      <label htmlFor={`${id}-input`} className="mb-1 block text-sm font-medium text-[var(--eds-ink)]">
        {label}
      </label>
      <input
        id={`${id}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open && filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        value={open ? query : selected?.label ?? ""}
        placeholder="Search registry models and runtimes"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      />
      {open && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          aria-label={`${label} options`}
          className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-1 shadow-xl"
        >
          {filtered.map((option, index) => {
            const unavailable = option.availability === "unavailable";
            return (
              <li
                key={option.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={option.id === selectedId}
                aria-disabled={unavailable}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                className="min-h-11 cursor-pointer rounded-lg px-3 py-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {option.providerLabel} · {option.modelId}
                    </p>
                  </div>
                  <span className="text-xs">{option.availability}</span>
                </div>
                <p className="mt-1 text-xs">{option.certification.label}</p>
                <p className="text-xs">{option.pricing.label}</p>
                {option.runtime && (
                  <p className="text-xs">
                    Local · {option.runtime.health} · {option.runtime.endpoint} · {option.runtime.authentication}
                    {option.runtime.readOnlyCertification ? " · Read-only certification" : ""}
                  </p>
                )}
                {option.unavailableReason && (
                  <p className="mt-1 text-xs text-amber-300">{option.unavailableReason}</p>
                )}
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="p-3 text-sm text-[var(--text-secondary)]">No registry options match.</li>
          )}
        </ul>
      )}
    </div>
  );
}
