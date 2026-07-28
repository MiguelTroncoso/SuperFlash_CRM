# ADR-013: Política de cancelación comercial

## Estado

Aceptado.

## Decisión

Una Sale no se cancela mientras sus pagos confirmados tengan neto mayor que cero. Se deben completar los reembolsos necesarios; cuando el neto sea cero la cancelación se ejecuta bajo lock y deja AuditLog/Activity. No se borran pagos ni ventas.
