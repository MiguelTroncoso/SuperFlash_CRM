# ADR-016: Revenue Intelligence Boundary

## Estado

Aceptado como roadmap; no implementado.

## Contexto

Las métricas de adquisición, revenue y predicción necesitan una frontera clara
para no contaminar los agregados transaccionales ni convertir analítica futura en
dependencia operativa del CRM.

## Decisión

Revenue Intelligence será una capacidad de Architecture v2.0. Consumirá datos y
eventos durables de la plataforma, pero no cambiará directamente Sales, Payments,
Subscriptions, Renewals ni sus snapshots. La identidad comercial y el revenue
reconocido permanecen en los dominios transaccionales.

La capacidad queda documentada en
[revenue-intelligence.md](roadmap/revenue-intelligence.md) y no se implementa en
este cambio.

## Consecuencias

Se preserva la independencia entre operaciones y analítica, se facilita la
reconstrucción histórica y se evita crear tablas o migraciones antes de aprobar
el modelo analítico.
