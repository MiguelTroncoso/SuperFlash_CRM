export interface DailyMetricImportRow {
  metricDate: string;
  campaignName?: string;
  platform?: string;
  country: string;
  conversations: number;
  demos: number;
  salesCount: number;
  adSpend: string;
  grossRevenue?: string;
  currency: string;
  notes?: string;
}

export interface DailyMetricImportError {
  row: number;
  message: string;
}

export interface DailyMetricImportPreview {
  rows: DailyMetricImportRow[];
  errors: DailyMetricImportError[];
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, '');
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
      continue;
    }
    value += character;
  }
  values.push(value.trim());
  return values;
}

function parseNumber(value: string, label: string): number {
  const normalized = value.trim().replace(/\s/g, '');
  const canonical =
    normalized.includes(',') && !normalized.includes('.')
      ? normalized.replace(',', '.')
      : normalized.replace(/,/g, '');
  const parsed = Number(canonical);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} debe ser un entero no negativo.`);
  }
  return parsed;
}

function parseMoney(value: string, label: string): string {
  const normalized = value.trim().replace(/\s/g, '');
  const canonical =
    normalized.includes(',') && normalized.includes('.')
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized.replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(canonical)) {
    throw new Error(`${label} debe ser un monto no negativo.`);
  }
  return Number(canonical).toFixed(2);
}

function valueFor(values: string[], indexes: Map<string, number>, ...keys: string[]): string {
  for (const key of keys) {
    const index = indexes.get(key);
    if (index !== undefined) return values[index] ?? '';
  }
  return '';
}

export function parseDailyMetricsCsv(csv: string): DailyMetricImportPreview {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines.length) return { rows: [], errors: [{ row: 1, message: 'El CSV está vacío.' }] };

  const headers = splitCsvLine(lines[0] ?? '').map(normalizeHeader);
  const indexes = new Map(headers.map((header, index) => [header, index]));
  const required = [
    ['fecha'],
    ['pais', 'country'],
    ['conversaciones', 'conversations'],
    ['demos', 'demo'],
    ['gasto', 'adspend', 'spend'],
  ];
  const missing = required.filter((keys) => !keys.some((key) => indexes.has(key)));
  if (missing.length) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          message: `Faltan columnas requeridas: ${missing.map((keys) => keys[0]).join(', ')}.`,
        },
      ],
    };
  }

  const rows: DailyMetricImportRow[] = [];
  const errors: DailyMetricImportError[] = [];
  lines.slice(1).forEach((line, offset) => {
    const rowNumber = offset + 2;
    try {
      const values = splitCsvLine(line);
      const country = valueFor(values, indexes, 'pais', 'country').toUpperCase();
      if (!/^(?:[A-Z]{2}|GLOBAL)$/.test(country)) throw new Error('País debe ser ISO-2 o GLOBAL.');
      const metricDate = valueFor(values, indexes, 'fecha');
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(metricDate) ||
        Number.isNaN(Date.parse(`${metricDate}T00:00:00.000Z`))
      ) {
        throw new Error('Fecha debe usar formato YYYY-MM-DD.');
      }
      const currency = (valueFor(values, indexes, 'moneda', 'currency') || 'USD').toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency))
        throw new Error('Moneda debe usar código ISO de tres letras.');
      rows.push({
        metricDate,
        ...(valueFor(values, indexes, 'campana', 'campaign')
          ? { campaignName: valueFor(values, indexes, 'campana', 'campaign') }
          : {}),
        ...(valueFor(values, indexes, 'plataforma', 'platform')
          ? { platform: valueFor(values, indexes, 'plataforma', 'platform') }
          : {}),
        country,
        conversations: parseNumber(
          valueFor(values, indexes, 'conversaciones', 'conversations'),
          'Conversaciones',
        ),
        demos: parseNumber(valueFor(values, indexes, 'demos', 'demo'), 'Demos'),
        salesCount: parseNumber(valueFor(values, indexes, 'ventas', 'sales') || '0', 'Ventas'),
        adSpend: parseMoney(valueFor(values, indexes, 'gasto', 'adspend', 'spend'), 'Gasto'),
        ...(valueFor(values, indexes, 'facturacion', 'grossrevenue', 'revenue')
          ? {
              grossRevenue: parseMoney(
                valueFor(values, indexes, 'facturacion', 'grossrevenue', 'revenue'),
                'Facturación',
              ),
            }
          : {}),
        currency,
        ...(valueFor(values, indexes, 'notas', 'notes')
          ? { notes: valueFor(values, indexes, 'notas', 'notes') }
          : {}),
      });
    } catch (error: unknown) {
      errors.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Fila inválida.',
      });
    }
  });
  return { rows, errors };
}
