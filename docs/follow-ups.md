# Seguimientos comerciales

El módulo vive en `apps/api/src/modules/follow-ups` y expone `/api/v1/follow-ups`.

## Endpoints

- `POST /` crea un seguimiento para una oportunidad disponible.
- `GET /` lista con paginación, búsqueda, responsable, oportunidad, contacto, prioridad, estado, vencimiento, archivado y rangos de fecha.
- `GET /:id` devuelve detalle con responsable, actores, oportunidad, contacto, hasta 30 eventos de historial y hasta 20 actividades relevantes.
- `PATCH /:id` edita `title`, `note`, `priority` y `reminderAt` mientras el estado es `PENDING`.
- `PATCH /:id/assignee` cambia el responsable; todos los seguimientos activos siempre tienen uno.
- `POST /:id/complete`, `/cancel` y `/reschedule` son las únicas operaciones de transición.
- `POST /:id/archive` y `/restore` implementan archivado reversible.
- `GET /:id/history` pagina el historial append-only.

Todos los endpoints requieren JWT y `followups.read`, `followups.create`, `followups.update` o `followups.delete` según corresponda. Las consultas siempre agregan `organizationId` desde el contexto autenticado.

## Estados y vencimiento

`PENDING` es activo, `COMPLETED` representa una acción realizada, `CANCELLED` un seguimiento anulado y `RESCHEDULED` el registro original reemplazado. No existe `OVERDUE`: la respuesta calcula `isOverdue` cuando `status = PENDING` y `dueAt` es anterior al instante actual.

`title` se recorta, normaliza espacios duplicados y acepta de 2 a 160 caracteres. `note` admite hasta 2.000 caracteres. `dueAt` puede ser pasado solo para Owner/Admin y no puede superar cinco años; Sales no puede crearlo vencido. `reminderAt` debe estar entre 90 días antes y `dueAt` inclusive.

## Duplicados y concurrencia

Un duplicado activo es la combinación `(organizationId, opportunityId, userId, dueAt)` con `status = PENDING`, `archivedAt IS NULL` y `deletedAt IS NULL`. El servicio hace una comprobación previa para producir `FOLLOW_UP_ALREADY_EXISTS` y PostgreSQL mantiene el índice único parcial `FollowUp_active_duplicate_key` para carreras concurrentes. La violación se traduce al mismo error de dominio e incluye `existingFollowUpId`.

Completar, cancelar, asignar, archivar y restaurar se ejecutan en transacciones. Las transiciones usan un `updateMany` condicional para impedir dobles efectos. Reprogramar marca el original como `RESCHEDULED`, conserva su `dueAt`, crea un nuevo `PENDING` con `rescheduledFromId`, escribe historial para ambos y devuelve `{ original, replacement }`. Si dos solicitudes compiten, solo una puede actualizar el original y crear reemplazo.

Cada operación significativa escribe `FollowUpHistory`, `Activity` y `AuditLog`, y actualiza `Contact.lastActivityAt`. Auditoría guarda valores resumidos y no payloads completos, credenciales ni tokens.

## Política por responsable

Owner/Admin leen y modifican todo el tenant. Sales ve seguimientos propios, de oportunidades propias y de oportunidades sin responsable; solo modifica los que puede trabajar según esa misma regla y solo puede autoasignarse. Viewer conserva lectura si tiene `followups.read`. La política se aplica tanto en consultas SQL como antes de mutaciones.

La oportunidad debe ser del tenant, estar activa y tener contacto no eliminado. Sales no puede crear sobre oportunidades de otro vendedor; para oportunidades `WON` o `LOST` necesita una nota no vacía.
