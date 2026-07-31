# Renewals

`Renewal` representa el siguiente cobro de una suscripción. Conserva la venta fuente, un snapshot independiente versionado, `periodStart`, `periodEnd` y un `cycleKey` determinista. PostgreSQL aplica unicidad por organización, suscripción y ciclo.

## Endpoints

- `POST /api/v1/renewals/from-subscription/:subscriptionId`: crea una renovación pendiente idempotente.
- `GET /api/v1/renewals`: lista por estado, suscripción y rango de vencimiento.
- `GET /api/v1/renewals/:id`: detalle.
- `POST /api/v1/renewals/:id/due`: pasa a `DUE`.
- `POST /api/v1/renewals/:id/pay`: crea una nueva `Sale` confirmada, `SaleItem` snapshot y `Payment` confirmado.
- `POST /api/v1/renewals/:id/cancel`: cancela la renovación no pagada.

El [Centro de Renovaciones](renewal-center.md) agrega dashboard, listas rápidas,
calendario, estados operativos, recordatorios internos, reportes, exportación
CSV e importación histórica con vista previa.

Estados financieros: `PENDING`, `DUE`, `OVERDUE`, `PAID`, `CANCELLED`. El
workflow operativo es independiente y permite `CONTACTED`, `IN_CONVERSATION`,
`PAYMENT_PROMISE`, `RENEWED`, `NOT_RENEWED` y `LOST`. Una renovación pagada nunca
muta la venta histórica: relaciona la nueva venta en `generatedSaleId` y
actualiza únicamente el periodo de la suscripción.

La creación y el pago bloquean Renewal y Subscription dentro de transacciones cortas. El pago solo es válido con Subscription `ACTIVE`, genera una venta nueva y avanza al periodo persistido sin modificar la venta histórica. Solicitudes simultáneas son idempotentes. `due` rechaza transiciones anticipadas. Eventos, Activity y auditoría conservan `requestId` y se publican mediante Outbox.
