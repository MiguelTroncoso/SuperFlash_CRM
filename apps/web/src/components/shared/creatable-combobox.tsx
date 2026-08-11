'use client';

import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

export interface ComboboxOption {
  id: string;
  label: string;
  secondary?: string | undefined;
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
  const root = useRef<HTMLDivElement>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = options.filter((option) =>
    `${option.label} ${option.secondary ?? ''}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  const exactOption = options.find(
    (option) => option.label.trim().toLocaleLowerCase() === normalizedSearch,
  );
  const canCreate = Boolean(onCreate && search.trim() && !exactOption && !isLoading);

  useEffect(() => {
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const select = (option: ComboboxOption | null): void => {
    onSelect(option);
    onSearch(option?.label ?? '');
    setOpen(false);
  };

  return (
    <div className="relative space-y-1" ref={root}>
      <span className="block text-sm font-semibold text-content-primary">{label}</span>
      <Input
        aria-autocomplete="list"
        aria-expanded={open}
        aria-label={label}
        autoComplete="off"
        disabled={isLoading}
        onChange={(event) => {
          onSearch(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key !== 'Enter' || !open) return;
          event.preventDefault();
          const option = exactOption ?? filtered[0];
          if (option) {
            select(option);
          } else if (canCreate && onCreate) {
            onCreate(search.trim());
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        role="combobox"
        value={search}
      />
      {open ? (
        <div
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border-subtle bg-surface-raised p-1 shadow-xl"
          role="listbox"
        >
          {isLoading ? (
            <p className="px-3 py-2 text-xs text-content-muted">Creando…</p>
          ) : (
            <>
              <button
                className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-content-muted hover:bg-surface-inset"
                onClick={() => select(null)}
                type="button"
              >
                {emptyLabel}
              </button>
              {filtered.map((option) => (
                <button
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-content-primary hover:bg-surface-inset"
                  key={option.id}
                  onClick={() => select(option)}
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
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                  onClick={() => {
                    if (onCreate) onCreate(search.trim());
                    setOpen(false);
                  }}
                  type="button"
                >
                  ＋ {createLabel} “{search.trim()}”
                </button>
              ) : null}
              {!filtered.length && !canCreate && !exactOption ? (
                <p className="px-3 py-2 text-xs text-content-muted">No hay coincidencias.</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {selectedLabel && selectedLabel !== search ? (
        <span className="block text-xs text-content-muted">Seleccionado: {selectedLabel}</span>
      ) : null}
    </div>
  );
}
