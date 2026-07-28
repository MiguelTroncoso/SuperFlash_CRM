# ADR-007: Saldo calculado

## Estado

Aceptado y endurecido en la remediación Architecture v1.0.

## Decisión

No se almacenan `remainingBalance` ni `paidAmount`. El saldo se calcula desde `Sale.total` y los pagos confirmados/reembolsados.

## Motivo

Evita dos fuentes de verdad y reduce errores ante pagos parciales, comisiones y reembolsos concurrentes.

## Consecuencia

La confirmación de un pago bloquea la venta antes de agregar el saldo. El cálculo es determinista y la auditoría conserva los cambios de cada pago. Una venta solo puede cancelarse cuando el saldo confirmado neto es cero.
