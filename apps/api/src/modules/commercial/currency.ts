export const CURRENCY_CATALOG_VERSION = '2026-01';

export const SUPPORTED_CURRENCIES = [
  'ARS',
  'BOB',
  'BRL',
  'CLP',
  'COP',
  'CRC',
  'DOP',
  'EUR',
  'GTQ',
  'MXN',
  'PEN',
  'PYG',
  'USD',
  'UYU',
  'VES',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}
