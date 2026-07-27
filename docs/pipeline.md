# Pipeline comercial

El tablero se expone como backend bajo `/api/v1/pipeline`; no incluye todavía una interfaz frontend.

## Lectura

- `GET /api/v1/pipeline` devuelve columnas activas y hasta 50 oportunidades por columna. Los filtros soportan responsable, campaña, producto, país y búsqueda.
- `GET /api/v1/pipeline/stages/:id/opportunities` pagina una columna con cursor estable por `(createdAt, id)`.
- `GET /api/v1/pipeline/summary` entrega conteos y montos agrupados por etapa y moneda. Nunca suma CLP, USD u otras monedas entre sí.

## Administración de etapas

Con `settings.manage` se pueden usar `POST /stages`, `PATCH /stages/:id`, `POST /stages/:id/reorder`, `POST /stages/:id/archive` y `POST /stages/:id/restore`.

Las etapas tienen nombre, orden, color, `active` y categoría `OPEN`, `WON` o `LOST`. El archivado de una etapa es independiente de archivar oportunidades. No se permite archivar una etapa con oportunidades activas ni dejar al tenant sin una etapa activa de una categoría.

Los cambios de orden se ejecutan dentro de una transacción PostgreSQL con `pg_advisory_xact_lock` por organización y usan un rango temporal para respetar la unicidad de `organizationId + order` durante el reordenamiento concurrente.
