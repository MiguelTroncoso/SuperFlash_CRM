# ADR-020 — Fulfillment Identity

## Decisión

La identidad persistente de un fulfillment combina `organizationId`,
`saleItemId` y el ciclo (`identityKey`). El índice único y las transacciones
bajo lock hacen idempotente la creación concurrente y preservan snapshots.
