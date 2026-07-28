# ADR-012: Identidad de ciclo de Renewal

## Estado

Aceptado.

## Decisión

Cada renovación persiste `periodStart`, `periodEnd` y `cycleKey`. PostgreSQL aplica unicidad por `organizationId + subscriptionId + cycleKey`; el servicio bloquea la suscripción para que reintentos concurrentes sean idempotentes.
