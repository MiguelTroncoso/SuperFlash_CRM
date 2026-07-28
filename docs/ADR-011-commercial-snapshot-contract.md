# ADR-011: Contrato de snapshot comercial

## Estado

Aceptado.

## Decisión

`SaleItem`, `Subscription` y `Renewal` guardan `snapshotVersion=2` y un JSON que contiene producto, plan, variante, precios, costo, mínimo, moneda, impuestos, periodo, fulfillment, requisito de suscripción, fuente de pricing y metadata. Los datos históricos no dependen del catálogo vivo.

## Seguridad

Costo y precio mínimo se persisten para auditoría y margen, pero se eliminan de respuestas cuando el actor no tiene `catalog.costs.read`.
