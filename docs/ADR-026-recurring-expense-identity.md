# ADR-026 — Recurring Expense Identity

Las ocurrencias recurrentes se identifican por `organizationId`, plantilla y `occurrenceKey`. La unicidad PostgreSQL y la transacción de generación garantizan que reintentos concurrentes no creen duplicados.
