# ADR-009: Motor de renovaciones

## Estado

Aceptado y endurecido en la remediación Architecture v1.0.

## Decisión

Renewal conserva la venta fuente, `periodStart`, `periodEnd`, `cycleKey` y un snapshot versionado. Al pagarse, crea una nueva Sale confirmada con snapshot y Payment confirmado.

## Motivo

Una renovación es un nuevo acuerdo comercial; modificar la venta anterior destruiría el histórico y dificultaría conciliación y auditoría.

## Consecuencia

El pago es idempotente mediante bloqueo de Renewal y Subscription, `generatedSaleId` y unicidad por ciclo. Solo se permite con Subscription `ACTIVE`; la suscripción avanza su periodo únicamente después de crear la nueva venta y pago en la misma transacción.
