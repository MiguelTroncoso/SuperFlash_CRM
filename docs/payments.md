# Payments

`Payment` es independiente de `Sale` y permite pagos parciales, completos y reembolsos parciales o completos.

## Endpoints

- `POST /api/v1/sales/:saleId/payments`: registra un pago `PENDING`.
- `GET /api/v1/sales/:saleId/payments`: lista los pagos de una venta.
- `GET /api/v1/payments`: lista con filtros de estado, método y venta, paginación y orden.
- `GET /api/v1/payments/:id`: obtiene un pago del tenant.
- `POST /api/v1/payments/:id/confirm`: confirma el pago.
- `POST /api/v1/payments/:id/fail`: marca un pago fallido.
- `POST /api/v1/payments/:id/refund`: reembolsa un importe, validando el disponible.

Métodos soportados: `TRANSFER`, `PAYPAL`, `BINANCE`, `MERCADOPAGO`, `STRIPE`, `CASH`, `MANUAL` y `OTHER`. Estados: `PENDING`, `CONFIRMED`, `FAILED` y `REFUNDED`.

## Saldo y concurrencia

El saldo nunca se persiste. Se calcula en servidor con los pagos confirmados/reembolsados:

`balance = sale.total - confirmed.netAmount + refundedAmount`

La confirmación bloquea la venta y luego agrega los pagos confirmados, evitando que dos confirmaciones simultáneas excedan el total. `idempotencyKey` es única por organización para reintentos seguros.

Eventos: `PaymentCreated`, `PaymentConfirmed`, `PaymentFailed` y `PaymentRefunded`. Auditoría registra importes mínimos y nunca tokens, secretos ni credenciales.
