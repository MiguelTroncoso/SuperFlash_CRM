# ADR-009: Motor de renovaciones

## Decisión

Renewal conserva la venta fuente y, al pagarse, crea una nueva Sale confirmada con snapshot y Payment confirmado.

## Motivo

Una renovación es un nuevo acuerdo comercial; modificar la venta anterior destruiría el histórico y dificultaría conciliación y auditoría.

## Consecuencia

El pago es idempotente mediante bloqueo de la renovación y `generatedSaleId`. La suscripción avanza su periodo únicamente después de crear la nueva venta y pago en la misma transacción.
