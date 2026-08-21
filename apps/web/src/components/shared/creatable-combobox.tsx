'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

export interface ComboboxOption {
  id: string;
  label: string;
  secondary?: string | undefined;
  disabled?: boolean;
}

export function CreatableCombobox({
  label,
  placeholder,
  search,
  options,
  selectedLabel,
  onSearch,
  onSelect,
  onCreate,
  createLabel,
  emptyLabel,
  isLoading = false,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly search: string;
  readonly options: ComboboxOption[];
  readonly selectedLabel?: string | undefined;
  readonly onSearch: (value: string) => void;
  readonly onSelect: (option: ComboboxOption | null) => void;
  readonly onCreate?: (value: string) => void;
  readonly createLabel: string;
  readonly emptyLabel: string;
  readonly isLoading?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = options.filter((option) =>
    `${option.label} ${option.secondary ?? ''}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  const exactOption = options.find(
    (option) => option.label.trim().toLocaleLowerCase() === normalizedSearch,
  );
  const canCreate = Boolean(onCreate && search.trim() && !exactOption && !isLoading);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent): void => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleSelect = (option: ComboboxOption | null): void => {
    if (option?.disabled) return;
    onSelect(option);
    if (option) {
      onSearch(option.label);
    }
    setOpen(false);
    setHighlightedIndex(-1);
  };

  return (
    <div className="relative space-y-1" ref={root}>
      <div className="flex items-center justify-between">
        <span className="block text-sm font-semibold text-content-primary">{label}</span>
        {isLoading ? (
          <span className="inline-flex items-center gap-1 text-xs text-brand-600">
            <span className="h-2 w-2 animate-ping rounded-full bg-brand-500" />
            Buscando…
          </span>
        ) : null}
      </div>
      <div className="relative">
        <Input
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-label={label}
          autoComplete="off"
          onChange={(event) => {
            onSearch(event.target.value);
            setOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              setHighlightedIndex(-1);
              return;
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (!open) {
                setOpen(true);
                return;
              }
              const maxIndex = filtered.length - 1;
              setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) {
                setOpen(true);
                return;
              }
              const maxIndex = filtered.length - 1;
              setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
              return;
            }
            if (event.key === 'Enter') {
              if (!open) return;
              event.preventDefault();
              if (highlightedIndex >= 0 && filtered[highlightedIndex]) {
                handleSelect(filtered[highlightedIndex]);
              } else if (canCreate && onCreate) {
                onCreate(search.trim());
                setOpen(false);
                setHighlightedIndex(-1);
              }
            }
          }}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          value={search}
        />
        {selectedLabel && (
          <button
            aria-label="Limpiar selección"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-content-muted hover:bg-surface-inset hover:text-content-primary"
            onClick={() => {
              handleSelect(null);
              onSearch('');
            }}
            type="button"
          >
            ✕
          </button>
        )}
      </div>
      {open ? (
        <div
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-xl"
          id={listboxId}
          role="listbox"
        >
          {emptyLabel ? (
            <button
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-content-muted hover:bg-surface-inset"
              onClick={() => handleSelect(null)}
              type="button"
            >
              {emptyLabel}
            </button>
          ) : null}
          {filtered.map((option, index) => (
            <button
              aria-selected={highlightedIndex === index}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm text-content-primary hover:bg-surface-inset ${
                highlightedIndex === index ? 'bg-surface-inset font-semibold' : ''
              } ${option.disabled ? 'cursor-not-allowed opacity-60 hover:bg-transparent' : ''}`}
              disabled={option.disabled}
              key={option.id}
              onClick={() => handleSelect(option)}
              role="option"
              type="button"
            >
              <span className="block font-semibold">{option.label}</span>
              {option.secondary ? (
                <span className="block text-xs text-content-muted">{option.secondary}</span>
              ) : null}
            </button>
          ))}
          {canCreate ? (
            <button
              className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10"
              onClick={() => {
                if (onCreate) onCreate(search.trim());
                setOpen(false);
                setHighlightedIndex(-1);
              }}
              type="button"
            >
              ＋ {createLabel} “{search.trim()}”
            </button>
          ) : null}
          {!filtered.length && !canCreate && !exactOption && !isLoading ? (
            <p className="px-3 py-2 text-xs text-content-muted">No encontramos coincidencias.</p>
          ) : null}
        </div>
      ) : null}
      {selectedLabel && selectedLabel !== search ? (
        <span className="block text-xs font-medium text-brand-600">
          Seleccionado: {selectedLabel}
        </span>
      ) : null}
    </div>
  );
}
