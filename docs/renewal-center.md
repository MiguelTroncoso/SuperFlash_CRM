# Centro de Renovaciones

El Centro de Renovaciones es la bandeja operativa para administrar ciclos de suscripción sin enviar mensajes automáticamente. Su fuente de verdad sigue siendo `Renewal`; el estado financiero (`PENDING`, `DUE`, `OVERDUE`, `PAID`, `CANCELLED`) se mantiene separado del estado de trabajo (`PENDING`, `CONTACTED`, `IN_CONVERSATION`, `PAYMENT_PROMISE`, `PAID`, `RENEWED`, `NOT_RENEWED`, `CANCELLED`, `LOST`).

## Rutas

- `GET /api/v1/renewal-center/dashboard`
- `GET /api/v1/renewal-center/upcoming`, `/today`, `/overdue`, `/history`
- `GET /api/v1/renewal-center/calendar`
- `GET /api/v1/renewal-center/control-center`
- `PATCH /api/v1/renewal-center/:id/workflow-status`
- `POST /api/v1/renewals/:id/pay` para renovar manualmente
- `GET /api/v1/renewal-center/reminders`
- `POST /api/v1/renewal-center/reminders/generate`
- `GET /api/v1/renewal-center/reports`
- `GET /api/v1/renewal-center/reports/export`

Todas las consultas están filtradas por `organizationId` derivado del JWT. Los permisos son `renewals.read`, `renewals.create`, `renewals.update`, `renewals.delete` y `renewals.export`.

## Renovación manual

El pago manual bloquea Renewal y Subscription en una transacción, crea la nueva venta y pago, registra Activity/AuditLog y genera idempotentemente el siguiente ciclo. Revenue Intelligence y Financial Intelligence lo reflejan porque leen las ventas, pagos y renovaciones persistidas; no se duplica ningún ingreso.

No existe envío automático de WhatsApp ni actualización automática del Pipeline.
