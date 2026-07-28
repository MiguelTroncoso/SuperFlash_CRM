# Fulfillment

Un `Fulfillment` es la obligación de entregar un `SaleItem` confirmado. Su
`identityKey` (`saleItemId:ciclo`) es persistente y evita duplicados incluso
cuando dos requests llegan simultáneamente. Las asignaciones y transiciones
relevantes bloquean la fila y escriben Activity, AuditLog y Outbox en la misma
transacción.

Estados: `PENDING`, `ASSIGNED`, `PROCESSING`, `COMPLETED`, `FAILED` y
`CANCELLED`. La operación `POST /api/v1/fulfillments/:id/provision` ejecuta el
adaptador fuera de la transacción y persiste el resultado después, aislando
errores externos futuros.

`GET /api/v1/my-day` agrega pendientes y fallidos de fulfillment, activaciones
pendientes, trials próximos a vencer, credenciales por entregar y reintentos
de provisioning. Los datos operativos no exponen secretos.
