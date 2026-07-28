# Catálogo multiproducto

El Sprint 7 incorpora el catálogo tenant-aware sin modificar ventas, pagos ni suscripciones.

## Recursos

Todos los endpoints requieren JWT y viven bajo `/api/v1/catalog`:

- `/categories`: categorías ordenables, archivado y restauración.
- `/products`: productos con slug, SKU, tipo, fulfillment, planes, variantes y ciclo de vida.
- `/products/:productId/plans`: planes por producto, con segmento y período.
- `/products/:productId/variants`: variantes con `attributes` como objeto JSON raíz.
- `/price-books`: libros de precios con país, moneda, vigencia, prioridad y default.
- `/price-books/:priceBookId/entries`: precios por producto/plan/variante y su historial append-only.
- `/pricing/resolve`: resolución de precio vigente para una combinación.
- `/offers`: catálogo público de ofertas activas con precios actuales.

La autorización usa `catalog.read`, `catalog.create`, `catalog.update`, `catalog.delete`,
`catalog.prices.read`, `catalog.prices.manage` y `catalog.costs.read`. Sales puede leer catálogo y
precios; Viewer solo lee; Owner/Admin administran el catálogo. Costos nunca se incluyen salvo que el
contexto autenticado tenga `catalog.costs.read` y solicite explícitamente `includeCosts=true`; si lo
solicita sin ese permiso, `/offers` y `/pricing/resolve` responden `403`.

## Integridad

Cada entidad contiene `organizationId` y las relaciones sensibles usan claves compuestas. Las consultas
siempre filtran el tenant en la base de datos. Slugs, códigos, defaults y combinaciones de precios
activas usan índices únicos parciales para convivir con soft delete. Las órdenes usan locks advisory de
PostgreSQL por organización y se renumeran sin huecos dentro de una transacción.

Los montos se reciben y devuelven como strings Decimal. PostgreSQL aplica checks de no negatividad,
vigencia, orden, moneda ISO 4217 y país ISO 3166-1 alpha-2. No se ejecuta ningún fulfillment API.

Un producto, plan o variante solo participa en resolución cuando está activo, no eliminado y, para el
producto, en estado `ACTIVE`. Un price book y su entrada deben estar activos, no archivados/eliminados y
vigentes en el instante consultado. `validFrom` es inclusivo y `validUntil` exclusivo. Los defaults se
mantienen transaccionalmente con lock advisory por organización.

## Seed de desarrollo

El seed base no crea productos ni precios. Para cargar ejemplos no comerciales (`TV`, `Canva`, `CapCut`
con planes de 1 y 3 meses), usar solo en desarrollo:

```bash
SEED_CATALOG_EXAMPLES=true npm run db:seed
```

No se generan precios de ejemplo y el seed sigue siendo idempotente.
