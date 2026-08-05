# Financial Intelligence Phase 1

Finanzas es un módulo independiente que complementa Revenue Intelligence. No duplica ni modifica la lógica de Sales, Payments, Subscriptions o Renewals.

## API

- `GET /api/v1/financial/dashboard`
- `GET /api/v1/financial/profitability`
- `GET|POST /api/v1/financial/categories`
- `PATCH|POST /api/v1/financial/categories/:id`
- `GET|POST /api/v1/financial/expenses`
- `PATCH|POST /api/v1/financial/expenses/:id`
- `GET|POST /api/v1/financial/recurring`
- `PATCH /api/v1/financial/recurring/:id`
- `POST /api/v1/financial/recurring/generate`

Todos los endpoints son tenant-aware y requieren `financial.read` o `financial.manage`. Los importes no se convierten entre monedas: los análisis deben pedir una moneda concreta cuando sea necesario.

## Métricas

El dashboard calcula ingresos de ventas confirmadas/fulfilled, egresos no eliminados, utilidad neta, margen, costos fijos/variables, punto de equilibrio, caja estimada y tendencia de 12 meses. En Phase 1, MRR/ARR se calculan únicamente al seleccionar una moneda; no se hace conversión implícita entre monedas.

El gasto publicitario de Marketing v2.9 se registra en `Expense` y queda
disponible para este dashboard sin duplicar filas financieras. La rentabilidad
de campaña lee pagos confirmados netos, snapshots de producto y costos de
Fulfillment. Las monedas permanecen separadas y los campos de costos/utilidad
se protegen con permisos comerciales.
