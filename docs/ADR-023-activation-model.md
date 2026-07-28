# ADR-023 — Activation Model

## Decisión

Activation representa el resultado operativo de Fulfillment. Solo un
fulfillment completado puede crearla y una restricción parcial PostgreSQL evita
duplicados activos. Las transiciones se auditan y pueden activar o suspender la
Subscription asociada sin depender del catálogo vivo.
