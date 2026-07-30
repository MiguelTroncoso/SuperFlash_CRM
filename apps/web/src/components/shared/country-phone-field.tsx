'use client';

import { COUNTRIES, getCountry, phoneMatchesCountry } from '@superflash/utils';

import { Select, Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function CountrySelect({
  value,
  onChange,
  className,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly className?: string;
}): React.ReactElement {
  return (
    <Select
      className={cn(className)}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">Todos los países</option>
      {COUNTRIES.map((item) => (
        <option key={item.code} value={item.code}>
          {item.flag} {item.name} ({item.code})
        </option>
      ))}
    </Select>
  );
}

export function CountryPhoneField({
  country,
  phone,
  onCountryChange,
  onPhoneChange,
  countryError,
  phoneError,
  required = false,
}: {
  readonly country: string;
  readonly phone: string;
  readonly onCountryChange: (value: string) => void;
  readonly onPhoneChange: (value: string) => void;
  readonly countryError?: string | undefined;
  readonly phoneError?: string | undefined;
  readonly required?: boolean;
}): React.ReactElement {
  const selectedCountry = getCountry(country);
  const incompatible = !phoneMatchesCountry(phone, country);
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <label className="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        País
        <Select
          aria-invalid={Boolean(countryError || incompatible)}
          onChange={(event) => onCountryChange(event.target.value)}
          value={country}
        >
          <option value="">Selecciona un país</option>
          {COUNTRIES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.flag} {item.name} ({item.code}) {item.dialCode}
            </option>
          ))}
        </Select>
        {countryError ? <p className="text-xs text-rose-600">{countryError}</p> : null}
      </label>
      <label className="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Teléfono {required ? <span className="text-rose-500">*</span> : null}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-10 min-w-16 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
              incompatible && 'border-rose-300 text-rose-600',
            )}
          >
            {selectedCountry?.dialCode ?? '+—'}
          </span>
          <Input
            aria-invalid={Boolean(phoneError || incompatible)}
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder={selectedCountry ? `${selectedCountry.dialCode} 9 1234 5678` : '+56...'}
            type="tel"
            value={phone}
          />
        </div>
        {phoneError ? <p className="text-xs text-rose-600">{phoneError}</p> : null}
        {!phoneError && incompatible ? (
          <p className="text-xs text-rose-600">
            El prefijo del número no coincide con el país seleccionado.
          </p>
        ) : null}
        {!phoneError && !incompatible && selectedCountry && phone && !phone.startsWith('+') ? (
          <p className="text-xs text-slate-400">
            Se normalizará con el prefijo {selectedCountry.dialCode} a E.164.
          </p>
        ) : null}
      </label>
    </div>
  );
}
