# Importaciones comerciales

Las rutas `POST /api/v1/marketing/imports/preview`, `POST /marketing/imports`
y `GET /marketing/imports` usan `CommercialImport` y
`CommercialImportRow`. El preview valida filas sin escribir; la ejecución
requiere una `idempotencyKey`, conserva el informe por fila y nunca toma
`organizationId` desde el CSV.

En esta primera entrega están operativos Contacts y Attribution, con
normalización E.164, detección de duplicados, límites de payload y auditoría.
Los tipos históricos restantes (`HISTORICAL_SALES`, `PAYMENTS`,
`SUBSCRIPTIONS`, `DEMOS`, `OUTSTANDING_BALANCES`) se conservan en el contrato
pero requieren un adaptador de snapshot histórico antes de activar su escritura;
se rechazan explícitamente para no inventar datos financieros.
