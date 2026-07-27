# Pipeline comercial

El tablero se expone como backend bajo `/api/v1/pipeline`; no incluye todavía una interfaz frontend.

## Lectura

- `GET /api/v1/pipeline` devuelve columnas activas y hasta 50 oportunidades por columna. Los filtros soportan responsable, campaña, producto, país y búsqueda.
- `GET /api/v1/pipeline/stages/:id/opportunities` pagina una columna con cursor estable por `(createdAt, id)`.
- `GET /api/v1/pipeline/summary` entrega conteos y montos agrupados por etapa y moneda. Nunca suma CLP, USD u otras monedas entre sí.

## Administración de etapas

Con `settings.manage` se pueden usar `POST /stages`, `PATCH /stages/:id`, `POST /stages/:id/reorder`, `POST /stages/:id/archive` y `POST /stages/:id/restore`.

Las etapas tienen nombre, orden, color, `active`, categoría `OPEN`, `WON` o `LOST` y un `systemKey` opcional. El archivado de una etapa es independiente de archivar oportunidades. No se permite archivar una etapa con oportunidades activas ni dejar al tenant sin una etapa activa de una categoría.

`systemKey` es un identificador técnico estable, único por tenant cuando está activo y no nulo. Las ocho etapas oficiales del seed usan `NEW_LEAD`, `LEFT_ON_READ`, `DEMO_DELIVERED`, `AWAITING_CREDIT_USAGE`, `AWAITING_MONEY`, `POTENTIAL_BUYER`, `WON` y `LOST`. El backfill de la migración reconoce las etapas oficiales existentes por nombre y orden. Las etapas custom no reciben clave automáticamente y los DTOs públicos no exponen `systemKey` como campo modificable.

El archivado comprueba uso y última etapa dentro del mismo bloqueo transaccional. El bloqueo usa dos
claves advisory: el namespace fijo `superflash:pipeline-stage-order` y la organización; así no se
comparte accidentalmente el lock con otro propósito. Dos archivados concurrentes de la última etapa
de una categoría dejan exactamente una etapa activa y uno de ellos recibe el conflicto de dominio.

Restaurar una etapa también se ejecuta bajo ese lock. Primero desplaza temporalmente el rango y luego
normaliza todas las etapas no eliminadas a órdenes positivos, únicos y consecutivos, conservando la
categoría de cada una. `PATCH /stages/:id` delega `active=false` al archivado y `active=true` a la
restauración cuando la etapa estaba inactiva; los cambios de nombre/color y su auditoría se confirman
en la misma transacción.

Los cambios de orden se ejecutan dentro de una transacción PostgreSQL con `pg_advisory_xact_lock` y
usan un rango temporal para respetar la unicidad de `organizationId + order` durante el reordenamiento
concurrente. Los movimientos concurrentes de una misma oportunidad usan una actualización condicional
por etapa actual: solo uno puede crear historial, Activity y auditoría; el otro recibe conflicto sin
dejar registros huérfanos.
