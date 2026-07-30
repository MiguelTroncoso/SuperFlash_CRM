export interface CountryDefinition {
  readonly code: string;
  readonly name: string;
  readonly dialCode: string;
  readonly flag: string;
}

export const COUNTRIES: readonly CountryDefinition[] = [
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  { code: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { code: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { code: 'SV', name: 'El Salvador', dialCode: '+503', flag: '🇸🇻' },
  { code: 'MX', name: 'México', dialCode: '+52', flag: '🇲🇽' },
  { code: 'US', name: 'Estados Unidos', dialCode: '+1', flag: '🇺🇸' },
  { code: 'PE', name: 'Perú', dialCode: '+51', flag: '🇵🇪' },
  { code: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]['code'];

export const COUNTRY_CODES: readonly CountryCode[] = COUNTRIES.map(
  (country) => country.code,
) as CountryCode[];

export function getCountry(code: string | null | undefined): CountryDefinition | undefined {
  return COUNTRIES.find((country) => country.code === code?.trim().toUpperCase());
}

export function isKnownCountry(code: string | null | undefined): code is CountryCode {
  return getCountry(code) !== undefined;
}

export function phoneMatchesCountry(
  phone: string | null | undefined,
  countryCode: string | null | undefined,
): boolean {
  const country = getCountry(countryCode);
  const value = phone?.trim() ?? '';
  if (!country || !value || !value.startsWith('+')) return true;
  const digits = value.replace(/\D/g, '');
  return digits.startsWith(country.dialCode.replace('+', ''));
}
