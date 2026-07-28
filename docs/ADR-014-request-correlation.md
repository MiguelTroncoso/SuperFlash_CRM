# ADR-014: Correlación de requests

## Estado

Aceptado.

## Decisión

La API acepta un `X-Request-Id` válido o genera UUID. Lo devuelve en header y body, y lo propaga a AuditLog, Activity, OutboxEvent, eventos de dominio y logs relevantes. El valor no contiene credenciales ni datos sensibles.
