# Business Intelligence

Business Intelligence expone vistas de lectura bajo `/api/v1/business-intelligence/:view`:

- `summary`: resumen por países, productos, campañas, vendedores, providers y renovaciones.
- `countries`, `products`, `campaigns`, `sellers`, `providers`, `renewals`: desglose especializado.

Todas las consultas reciben `organizationId` desde `AuthenticatedUser`, aplican rangos de fecha y filtros opcionales, y requieren `reports.read`. Costos, márgenes, churn, LTV y ROI solo se muestran cuando existe una fuente persistida suficiente; no se estiman valores faltantes.

La UI está en `/business-intelligence` y sus rutas secundarias. Las monedas se mantienen separadas.
