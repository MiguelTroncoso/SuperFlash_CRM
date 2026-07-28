# Price books y resolución de precios

## Price books

Un `PriceBook` se define por organización, segmento, país opcional, moneda ISO 4217, vigencia, prioridad
y estado. Solo puede existir un default activo para la combinación segmento/país/moneda. Activar,
desactivar, archivar y cambiar default requiere `catalog.prices.manage`.

Una `PriceBookEntry` referencia producto y opcionalmente plan y variante del mismo tenant. La variante
y el plan deben coincidir. Los montos usan `Decimal(18,2)` y se validan en aplicación y PostgreSQL:
sale/cost/minimum no pueden ser negativos y `minimumPrice <= salePrice`. Una combinación activa no puede
duplicarse, incluso bajo concurrencia.

Cada alta y cada cambio de sale/cost/minimum inserta un `PriceHistory`. Ese historial no tiene
`updatedAt`/`deletedAt` y no se expone con costos a usuarios sin `catalog.costs.read`.

## Resolución

`GET /api/v1/catalog/pricing/resolve` recibe `productId`, `planId` opcional, `variantId` opcional,
`customerSegment`, `countryCode`, `currency` y un instante opcional `at`. Solo considera producto,
plan, variante y price books activos, no eliminados, vigentes y de la moneda solicitada.

La selección es determinista: segmento exacto antes de `ANY`, país exacto antes del price book global,
default antes de prioridad y fecha de creación como desempate estable. La respuesta incluye una
explicación de los fallbacks y siempre serializa el precio como string.

El cliente nunca puede enviar un precio para alterar la resolución. `/offers` aplica la misma resolución
y agrupa ofertas activas por producto; omite productos sin precio vigente y nunca devuelve costos salvo
autorización explícita.
