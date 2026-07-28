# ADR-006: Snapshot de catálogo en Sales

## Estado

Aceptado y endurecido en la remediación Architecture v1.0.

## Decisión

Cada `SaleItem` conserva `snapshotVersion=2`, campos tipados y un `catalogSnapshot` inmutable con producto, plan, variante, SKU, cantidad, precio, mínimo, costo, moneda, impuestos, ciclo, fulfillment, fuente de pricing y metadata.

## Motivo

Productos, planes, variantes y precios son configurables. Una venta histórica debe seguir siendo explicable aunque el catálogo cambie, se archive o cambie de precio.

## Consecuencia

Las lecturas históricas usan el snapshot. Las relaciones al catálogo se mantienen como referencia opcional para navegación, pero no son la fuente de verdad económica. PostgreSQL impide mutar snapshots después de confirmar; costo y mínimo requieren `catalog.costs.read` para ser expuestos.
