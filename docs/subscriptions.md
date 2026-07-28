# Subscriptions

Una suscripción se crea desde un `SaleItem` de una venta `CONFIRMED` o `FULFILLED`, únicamente si `requiresSubscriptionSnapshot=true` y el ciclo es coherente. Copia el snapshot comercial versionado completo; no consulta el catálogo vivo para reconstruir el histórico.

## Endpoints

- `POST /api/v1/subscriptions/from-sale-item/:saleItemId`: crea una suscripción `PENDING` de forma idempotente.
- `GET /api/v1/subscriptions`: lista por estado, contacto o responsable con paginación y orden.
- `GET /api/v1/subscriptions/:id`: detalle del ciclo y snapshot.
- `POST /api/v1/subscriptions/:id/activate`.
- `POST /api/v1/subscriptions/:id/suspend`.
- `POST /api/v1/subscriptions/:id/expire`.
- `POST /api/v1/subscriptions/:id/cancel`.

Estados: `PENDING`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `CANCELLED`. Ciclos: `TRIAL`, `WEEKLY`, `MONTHLY`, `QUARTERLY`, `SEMI_ANNUAL`, `ANNUAL` y `CUSTOM` con `customIntervalDays`.

Las transiciones son protegidas por permisos, ownership y bloqueo de la suscripción. `CUSTOM` exige `customIntervalDays > 0`; los demás ciclos no aceptan intervalo personalizado. La unicidad `(organizationId, saleItemId)` impide crear dos suscripciones para el mismo ítem, incluso concurrentemente. Events y auditoría se escriben con `requestId` en Outbox/Activity/AuditLog.
