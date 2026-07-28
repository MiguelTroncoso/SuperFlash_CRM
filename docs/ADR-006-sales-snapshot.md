# ADR-006: Snapshot de catálogo en Sales

## Decisión

Cada `SaleItem` conserva campos tipados y un `catalogSnapshot` inmutable con la información utilizada al cerrar el acuerdo.

## Motivo

Productos, planes, variantes y precios son configurables. Una venta histórica debe seguir siendo explicable aunque el catálogo cambie, se archive o cambie de precio.

## Consecuencia

Las lecturas históricas usan el snapshot. Las relaciones al catálogo se mantienen como referencia opcional para navegación, pero no son la fuente de verdad económica.
