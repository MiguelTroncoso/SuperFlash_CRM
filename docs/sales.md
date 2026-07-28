# Sales

El dominio Sales modela acuerdos comerciales multiítem. Todas las consultas se filtran por la organización del JWT y las respuestas nunca exponen `organizationId`.

## Endpoints

- `POST /api/v1/sales`: crea una venta en `DRAFT` con uno o más ítems.
- `POST /api/v1/sales/from-opportunity/:opportunityId`: convierte una oportunidad una sola vez.
- `GET /api/v1/sales`: lista con `page`, `limit`, `search`, `status`, `contactId`, `opportunityId`, `userId`, `currency`, `sortBy` y `sortOrder`.
- `GET /api/v1/sales/:id`: detalle y saldo calculado.
- `PATCH /api/v1/sales/:id`: actualiza nota, descuento e impuesto mientras está en `DRAFT` o `PENDING`.
- `POST /api/v1/sales/:id/confirm`: confirma el acuerdo.
- `POST /api/v1/sales/:id/fulfill`: deja la venta en `FULFILLED`.
- `POST /api/v1/sales/:id/cancel`: cancela sin borrar físicamente información.

Todos requieren `JwtAuthGuard`, `PermissionsGuard` y el permiso de Sales correspondiente. Owner/Admin operan sobre todo el tenant; Sales solo sobre ventas propias o sin propietario.

## Snapshots y conversión

Cada `SaleItem` guarda nombre, slug, tipo, fulfillment, SKU, plan, variante, periodo, importes y `catalogSnapshot`. El catálogo vivo solo se usa al crear la venta; una venta existente no depende de él para su lectura histórica.

La conversión Opportunity → Sale usa la primera etapa comercial, conserva contacto, campaña/producto mediante el ítem snapshot y protege la operación con bloqueo de la oportunidad e índice único parcial por organización. Las conversiones concurrentes retornan el mismo acuerdo o el conflicto de dominio, sin duplicarlo.

Eventos publicados después del commit: `SaleCreated`, `SaleConfirmed`, `SaleCancelled` y `SaleFulfilled`.
