import { parseRenewalCsv } from '../src/modules/renewal-intelligence/renewal-csv';

describe('Renewal Intelligence import primitives', () => {
  it('parses quoted CSV values and normalizes accented headers', () => {
    const rows = parseRenewalCsv(
      'Cliente,Producto,Fecha vencimiento,Notas\nJuan Pérez,Plan mensual,2026-08-01,"Llamar, confirmar pago"',
    );
    expect(rows).toEqual([
      {
        line: 2,
        values: {
          cliente: 'Juan Pérez',
          producto: 'Plan mensual',
          'fecha vencimiento': '2026-08-01',
          notas: 'Llamar, confirmar pago',
        },
      },
    ]);
  });

  it('rejects malformed quoted CSV input', () => {
    expect(() => parseRenewalCsv('Cliente,Producto\n"Juan,Plan')).toThrow('comilla sin cerrar');
  });

  it('rejects duplicated or empty headers', () => {
    expect(() => parseRenewalCsv('Cliente,Cliente\nJuan,Plan')).toThrow('encabezados');
    expect(() => parseRenewalCsv(',Producto\nJuan,Plan')).toThrow('encabezados');
  });
});
