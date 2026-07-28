# ADR-008: Ciclo de vida de Subscription

## Estado

Aceptado y endurecido en la remediación Architecture v1.0.

## Decisión

Subscription nace desde un SaleItem snapshot de una venta `CONFIRMED` o `FULFILLED`, solo si el snapshot exige suscripción, y usa estados explícitos: `PENDING`, `ACTIVE`, `SUSPENDED`, `EXPIRED` y `CANCELLED`.

## Motivo

El ciclo debe ser auditable y no depender de nombres o estados implícitos del catálogo.

## Consecuencia

Las transiciones son validadas en servidor y bloqueadas por fila. `CUSTOM` exige intervalo positivo y la unicidad por SaleItem evita duplicados concurrentes. La suscripción conserva fechas de periodo y snapshot para soportar renovaciones futuras.
