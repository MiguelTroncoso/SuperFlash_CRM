# Sales

El dominio Sales modela acuerdos comerciales multiítem. Todas las consultas se filtran por la organización del JWT y las respuestas nunca exponen `organizationId`.

## Endpoints

- `POST /api/v1/sales`: crea una venta en `DRAFT` con uno o más ítems.
- `POST /api/v1/sales/from-opportunity/:opportunityId`: convierte una oportunidad una sola vez.
- `GET /api/v1/sales`: lista con `page`, `limit`, `search`, `status`, `contactId`, `opportunityId`, `userId`, `currency`, `sortBy` y `sortOrder`.
- `GET /api/v1/sales/:id`: detalle y saldo calculado.
- `PATCH /api/v1/sales/:id`: actualiza nota, descuento e impuesto mientras está en `DRAFT` o `PENDING`; la venta se bloquea y vuelve a validarse dentro de la transacción.
- `POST /api/v1/sales/:id/confirm`: confirma el acuerdo.
- `POST /api/v1/sales/:id/fulfill`: deja la venta en `FULFILLED`.
- `POST /api/v1/sales/:id/cancel`: cancela sin borrar físicamente información.

Todos requieren `JwtAuthGuard`, `PermissionsGuard` y el permiso de Sales correspondiente. Owner/Admin operan sobre todo el tenant; Sales solo sobre ventas propias o sin propietario.

## Snapshots y conversión

Cada `SaleItem` guarda un snapshot comercial versionado (`snapshotVersion=2`) con producto, slug, SKU, tipo, plan, variante, cantidad, precio, mínimo, costo, moneda, impuestos, ciclo, fulfillment, fuente de precio y metadata. El costo y mínimo solo se exponen con `catalog.costs.read`.

Después de `CONFIRMED`, PostgreSQL protege los `SaleItem` y snapshots contra cambios. La resolución de catálogo valida estados, vigencia, combinación, moneda y precio mínimo; un override requiere `catalog.prices.override` y motivo auditado.

Una venta con pagos confirmados netos mayores que cero no puede cancelarse. Primero deben completarse los reembolsos; con neto cero se permite cancelar.

La conversión Opportunity → Sale usa la primera etapa comercial, conserva contacto, campaña/producto mediante el ítem snapshot y protege la operación con bloqueo de la oportunidad e índice único parcial por organización. Las conversiones concurrentes retornan el mismo acuerdo o el conflicto de dominio, sin duplicarlo.

Los eventos `SaleCreated`, `SaleConfirmed`, `SaleCancelled` y `SaleFulfilled` se escriben como Transactional Outbox dentro de la misma transacción y se despachan de forma asíncrona con `eventId` y `requestId`.
