# ADR-022 — Trial Lifecycle

## Decisión

Los trials solo se crean para productos activos que permiten demos. El estado
se transiciona de forma explícita, se conserva el snapshot y la conversión crea
una Sale nueva dentro de la misma transacción, sin reescribir el historial.
