# Oportunidades

El módulo vive en `apps/api/src/modules/opportunities` y opera únicamente dentro del tenant de `AuthenticatedUser.organizationId`. Todas las rutas requieren access token Bearer y permisos efectivos.

## Rutas

- `POST /api/v1/opportunities` crea una oportunidad asociada a un contacto, etapa, campaña y producto del mismo tenant.
- `GET /api/v1/opportunities` lista con paginación, búsqueda, filtros y orden permitido.
- `GET /api/v1/opportunities/:id` devuelve detalle, últimas 20 actividades, seguimientos próximos, historial acotado y resumen de ventas.
- `PATCH /api/v1/opportunities/:id` actualiza título, monto, moneda, campaña y producto.
- `PATCH /api/v1/opportunities/:id/assignee` asigna o desasigna responsable según la política de ownership.
- `POST /api/v1/opportunities/:id/move` mueve la oportunidad y registra historial, Activity y auditoría.
- `POST /api/v1/opportunities/:id/reopen` reabre explícitamente una oportunidad cerrada, salvo que tenga venta activa.
- `POST /api/v1/opportunities/:id/archive` y `POST /api/v1/opportunities/:id/restore` aplican archivado reversible.
- `GET /api/v1/opportunities/:id/stage-history` pagina el historial append-only.

## Ciclo de vida

El estado no se guarda como string duplicado. Se calcula desde `PipelineStage.category` y `Opportunity.archivedAt`:

```text
OPEN --move--> WON  (closedAt y wonAt)
OPEN --move--> LOST (closedAt, lostAt y motivo obligatorio)
WON/LOST --reopen--> OPEN (limpia cierre y requiere endpoint explícito)
ANY --archive--> ARCHIVED
ARCHIVED --restore--> estado de la etapa
```

Mover una oportunidad cerrada a una etapa abierta directamente está prohibido. Cada transición crea un `OpportunityStageHistory` con `fromStageId`, `toStageId`, actor, motivo y fecha. La creación manual y el lead intake de contactos también generan el evento inicial con `fromStageId = null`.

Los montos usan `Decimal(14,2)` y llegan como strings; nunca se calculan con `number`. La respuesta serializa importes como strings.

## Ownership y aislamiento

Owner y Admin pueden modificar todas las oportunidades del tenant. Sales solo puede modificar oportunidades sin responsable o asignadas a sí mismo. Viewer queda en lectura. Las campañas, productos, responsables, contactos y etapas se validan con `organizationId` en servidor; un registro de otro tenant responde como inexistente.

## Pruebas

La suite `test/opportunities.e2e-spec.ts` usa el esquema PostgreSQL `auth_test` y cubre creación, aislamiento, ownership, transiciones, venta activa, archivado, paginación, filtros, auditoría y pipeline.
