# Centro de notificaciones

`Notification` es una comunicación interna dirigida a un usuario de una
organización. Las automatizaciones pueden crearla con título, cuerpo, tipo,
URL de navegación, metadata mínima y `requestId`.

## Estados

- `UNREAD`: estado inicial;
- `READ`: el usuario la abrió o marcó como leída;
- `ARCHIVED`: la retiró de su bandeja visible.

No se eliminan notificaciones físicamente. Las consultas siempre filtran por
`organizationId` y `userId` del contexto JWT, por lo que un usuario no puede
leer ni modificar la bandeja de otro tenant.

## API

- `GET /api/v1/notifications?page=1&limit=25` lista la bandeja y el contador
  `unread`;
- `POST /api/v1/notifications/:id/read` marca una notificación;
- `POST /api/v1/notifications/:id/archive` la archiva;
- `POST /api/v1/notifications/read-all` marca todas las pendientes.

Cada mutación crea AuditLog. El frontend ofrece lectura individual, archivado
y la operación global de marcar como leído; no expone secretos ni datos de
otros usuarios.
