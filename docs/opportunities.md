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

La creación de una oportunidad solo acepta una etapa activa, no eliminada y de categoría `OPEN`.
Si no se indica etapa, se usa la primera etapa abierta por orden. Las etapas `WON` y `LOST` solo
se alcanzan mediante `move`, que aplica sus reglas de cierre y motivo.

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

## Integridad del contacto

La consulta del contacto siempre queda limitada a `AuthenticatedUser.organizationId` y a registros no
eliminados. Owner y Admin pueden crear oportunidades para contactos activos o archivados. Sales solo
puede hacerlo para contactos no archivados y que estén sin responsable o asignados a sí mismo. Viewer
no puede crear.

El responsable se determina en este orden: `assignedUserId` explícito y válido, responsable actual
del contacto, usuario Sales autenticado y, finalmente, sin responsable para Owner/Admin. Sales nunca
puede crear una oportunidad sin responsable ni asignarla a otro usuario.

Restaurar una oportunidad comprueba dentro de la misma transacción que su contacto pertenece al tenant
y no está eliminado. Un contacto archivado sigue siendo restaurable; un contacto eliminado produce
`OPPORTUNITY_CONTACT_UNAVAILABLE` y no deja actividad ni auditoría parcial. Archivar y restaurar una
oportunidad actualizan `Contact.lastActivityAt`, Activity y AuditLog de forma atómica.

## Ownership y aislamiento

Owner y Admin pueden modificar todas las oportunidades del tenant. Sales solo puede modificar oportunidades sin responsable o asignadas a sí mismo. Viewer queda en lectura. Las campañas, productos, responsables, contactos y etapas se validan con `organizationId` en servidor; un registro de otro tenant responde como inexistente.

## Pruebas

La suite `test/opportunities.e2e-spec.ts` usa el esquema PostgreSQL `auth_test` y cubre creación,
contactos archivados/eliminados, etapas iniciales, aislamiento, ownership, transiciones, venta activa,
archivado, restauración, paginación, filtros, auditoría, activación de etapas y concurrencia PostgreSQL.
