# Price books y resolución de precios

## Price books

Un `PriceBook` se define por organización, segmento, país opcional, moneda ISO 4217, vigencia, prioridad
y estado. Solo puede existir un default activo para la combinación segmento/país/moneda. Activar,
desactivar, archivar y cambiar default requiere `catalog.prices.manage`. `priority` está limitada a
`-10000..10000`; la prioridad nunca supera una coincidencia de segmento o país.

Una `PriceBookEntry` referencia producto y opcionalmente plan y variante del mismo tenant. La variante
y el plan deben coincidir. Los montos usan `Decimal(18,2)` y se validan en aplicación y PostgreSQL:
sale/cost/minimum no pueden ser negativos y `minimumPrice <= salePrice`. Una combinación activa no puede
duplicarse, incluso bajo concurrencia. La identidad activa incluye `priceBookId`, producto, plan,
variante, `validFrom` y `validUntil`; los `NULL` se comparan como iguales mediante `NULLS NOT DISTINCT`.

Cada alta y cada cambio de sale/cost/minimum inserta un `PriceHistory`. Ese historial no tiene
`updatedAt`/`deletedAt` y no se expone con costos a usuarios sin `catalog.costs.read`.

## Resolución

`GET /api/v1/catalog/pricing/resolve` recibe `productId`, `planId` opcional, `variantId` opcional,
`customerSegment`, `countryCode`, `currency` y un instante opcional `at`. Solo considera producto,
plan, variante, entradas y price books comercialmente activos, no eliminados y de la moneda solicitada.

La vigencia se evalúa en la misma consulta de PostgreSQL: `validFrom <= at` y `validUntil > at`;
`validUntil` es exclusivo. Los valores nulos representan ausencia de límite. La consulta final vuelve a
validar organización, producto, plan, variante, estado y relación plan-variante para resistir cambios
concurrentes posteriores a las comprobaciones iniciales.

La selección es lexicográfica y determinista, en este orden: segmento exacto antes de `ANY`, país exacto
antes del price book global, `isDefault=true` antes de `false`, `priority` descendente, `createdAt`
descendente e `id` ascendente como desempate final estable. Una prioridad extrema no puede cambiar los
criterios superiores. La respuesta incluye una explicación de los fallbacks y siempre serializa el precio
como string.

El cliente nunca puede enviar un precio para alterar la resolución. `/offers` usa el mismo instante,
vigencia y filtros de comercialización que `/pricing/resolve`; omite productos, planes, variantes,
price books o entradas sin precio vigente. `includeCosts=true` requiere `catalog.costs.read`; sin ese
permiso tanto `/offers` como `/pricing/resolve` responden `403`, incluso si el usuario puede leer precios.

Los defaults se actualizan dentro de una transacción protegida por `pg_advisory_xact_lock` por
organización y por un índice único parcial que trata país `NULL` como un único alcance. Las entradas usan
un lock advisory por combinación y un índice único parcial para que dos solicitudes concurrentes produzcan
un éxito y un conflicto de dominio, nunca un `P2002` expuesto.
