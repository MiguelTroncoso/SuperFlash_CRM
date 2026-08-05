# Gasto publicitario

El gasto diario usa `Expense` como única fuente de verdad. `POST
/api/v1/marketing/spend` exige fecha, campaña, monto y moneda; permite
impresiones, alcance, clics y conversaciones importadas. La fuente queda
marcada como `MANUAL` en esta fase.

La identidad tenant-aware considera fecha, campaña, ad set, anuncio y moneda;
la clave de idempotencia evita reintentos duplicados y PostgreSQL protege la
carrera concurrente. No se suman monedas diferentes.

Fórmulas: CPA = gasto / ventas atribuidas; Cost per Conversation = gasto /
conversaciones; Gross ROAS = ingresos brutos / gasto; Net ROAS = ingresos netos
/ gasto. Un denominador cero devuelve `null`, nunca infinito ni cero inventado.
