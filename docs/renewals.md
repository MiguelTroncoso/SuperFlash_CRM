# Renewals

`Renewal` representa el siguiente cobro de una suscripción. Conserva la venta fuente y un snapshot independiente.

## Endpoints

- `POST /api/v1/renewals/from-subscription/:subscriptionId`: crea una renovación pendiente idempotente.
- `GET /api/v1/renewals`: lista por estado, suscripción y rango de vencimiento.
- `GET /api/v1/renewals/:id`: detalle.
- `POST /api/v1/renewals/:id/due`: pasa a `DUE`.
- `POST /api/v1/renewals/:id/pay`: crea una nueva `Sale` confirmada, `SaleItem` snapshot y `Payment` confirmado.
- `POST /api/v1/renewals/:id/cancel`: cancela la renovación no pagada.

Estados: `PENDING`, `DUE`, `OVERDUE`, `PAID`, `CANCELLED`. Una renovación pagada nunca muta la venta histórica: relaciona la nueva venta en `generatedSaleId` y actualiza únicamente el periodo de la suscripción.

La creación y el pago bloquean la suscripción/renovación dentro de transacciones cortas. Así, solicitudes simultáneas crean una sola renovación activa y generan una sola venta nueva. Eventos: `RenewalCreated`, `RenewalDue`, `RenewalPaid` y `RenewalCancelled`.
