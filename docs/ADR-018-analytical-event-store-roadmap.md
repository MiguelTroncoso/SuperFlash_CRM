# ADR-018: Analytical Event Store Roadmap

## Estado

Aceptado como roadmap; no implementado.

## Contexto

Revenue Intelligence necesitará métricas históricas, embudos, cohortes,
atribución, rendimiento y predicción. Consultar directamente los agregados
operacionales no debe alterar sus responsabilidades ni sus garantías.

## Decisión

Se planifica un Analytical Event Store alimentado desde Transactional Outbox.
Consumirá eventos como `ContactCreated`, `OpportunityCreated`,
`OpportunityStageChanged`, `SaleConfirmed`, `PaymentConfirmed`,
`SubscriptionActivated`, `RenewalPaid`, `SaleCancelled` y `PaymentRefunded`.

Su propósito será construir métricas históricas, funnel analytics, cohortes,
atribución, ROI, ROAS y forecasts sin modificar los dominios transaccionales.
El Event Store será append-only, versionado y separado de las consultas
operacionales.

No se crean tablas, migraciones, consumidores ni infraestructura analítica en
Architecture v1.0.

## Consecuencias

La analítica futura podrá reprocesar eventos durables y mantener independencia
operacional. El diseño detallado, retención, PII y contratos de payload requieren
una aprobación arquitectónica posterior.
