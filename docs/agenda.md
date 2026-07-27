# Agenda comercial

La agenda backend está en `/api/v1/agenda` y requiere `followups.read`.

## Día y resumen

`GET /api/v1/agenda` acepta `date=YYYY-MM-DD`, `timezone`, `assignedUserId`, `priority` y `status`. `date` usa el día actual de la zona configurada si se omite. `timezone` debe ser una zona IANA válida y por defecto usa `DEFAULT_TIMEZONE` (`America/Santiago`). La respuesta contiene los seguimientos cuyo `dueAt` cae dentro del día local y un resumen de estados más `overdueAtStartOfDay`.

`GET /api/v1/agenda/summary` acepta `dateFrom`, `dateTo`, `timezone` y `assignedUserId`. El rango incluye ambos extremos y se limita a 90 días. Cada día devuelve `total`, conteos por estado, urgentes y vencidos al inicio del día.

## Timezone

Las fechas se almacenan en UTC. El servicio construye el inicio y fin exclusivo del día con Luxon en la zona IANA solicitada y convierte ambos límites a UTC antes de consultar PostgreSQL. Así los cambios de fecha y los días de 23 o 25 horas no dependen de offsets escritos a mano.

Sales no puede ampliar su alcance mediante `assignedUserId`: la política fuerza el usuario autenticado. Owner/Admin pueden filtrar por responsable; Viewer solo lee lo permitido por sus permisos.

Las consultas agregadas usan `count` por estado y no cargan todos los seguimientos para agruparlos en memoria. El listado diario está limitado a 100 registros, mientras que el historial y listados generales usan los límites de sus DTOs.
