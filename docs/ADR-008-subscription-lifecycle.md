# ADR-008: Ciclo de vida de Subscription

## Decisión

Subscription nace desde un SaleItem snapshot y usa estados explícitos: `PENDING`, `ACTIVE`, `SUSPENDED`, `EXPIRED` y `CANCELLED`.

## Motivo

El ciclo debe ser auditable y no depender de nombres o estados implícitos del catálogo.

## Consecuencia

Las transiciones son validadas en servidor y bloqueadas por fila. La suscripción conserva fechas de periodo y snapshot para soportar renovaciones futuras.
