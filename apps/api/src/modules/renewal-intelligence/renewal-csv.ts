export interface RenewalCsvRow {
  line: number;
  values: Record<string, string>;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function parseCsvLine(source: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  if (quoted) throw new Error('El CSV contiene una comilla sin cerrar.');
  values.push(current.trim());
  return values;
}

export function parseRenewalCsv(csv: string): RenewalCsvRow[] {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error('El CSV debe incluir encabezados y al menos una fila.');
  const headers = parseCsvLine(lines[0]!).map(normalizeHeader);
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length > 0 || headers.some((header) => header.length === 0)) {
    throw new Error('El CSV contiene encabezados vacíos o duplicados.');
  }
  return lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    return {
      line: rowIndex + 2,
      values: Object.fromEntries(
        headers.map((header, index) => [header ?? '', values[index] ?? '']),
      ),
    };
  });
}

export function csvValue(values: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = values[normalizeHeader(name)];
    if (value) return value.trim();
  }
  return '';
}

export function csvEscape(value: unknown): string {
  const source = String(value ?? '');
  return /[",\n]/.test(source) ? `"${source.replaceAll('"', '""')}"` : source;
}
