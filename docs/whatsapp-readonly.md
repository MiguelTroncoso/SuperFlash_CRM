# WhatsApp Read Only

## Propósito

WhatsApp Read Only es el conector de observación operacional de SuperFlash. Lee
los mensajes y conversaciones que ya existen en el read model local de
WhatsApp, permite sincronizar el índice interno y alimenta Smart Inbox y
Revenue Intelligence.

El operador continúa respondiendo y administrando la conversación en WhatsApp
Business. SuperFlash no envía, edita, elimina, marca como leído ni archiva
conversaciones o mensajes del canal.

## Boundary

El provider vive en:

`apps/api/src/modules/communication/providers/whatsapp-readonly/`

Solo expone operaciones de lectura:

- `readMessagesAfter(organizationId, cursor)`;
- `readConversationSnapshot(organizationId)`.

No contiene métodos de escritura ni conoce modelos de Meta. La importación usa
el read model persistido por la infraestructura de webhook existente; este
sprint no hace llamadas al Graph API ni activa credenciales reales.

## Endpoints

Todos requieren autenticación y aislamiento por organización:

- `GET /api/v1/communication/channels/whatsapp-read-only/health`
- `GET /api/v1/communication/channels/whatsapp-read-only/sync-status`
- `POST /api/v1/communication/channels/whatsapp-read-only/sync`
- `POST /api/v1/communication/channels/whatsapp-read-only/reindex`
- `GET /api/v1/communication/channels/whatsapp-read-only/metrics`
- `GET /api/v1/revenue-intelligence/communication`

`whatsapp.read` permite consultar estado y métricas; `whatsapp.manage` permite
ejecutar sincronización o reindexación; `reports.read` protege las métricas de
Revenue Intelligence.

Los endpoints históricos de escritura del workspace permanecen bloqueados con
`WHATSAPP_READ_ONLY` para mantener compatibilidad del contrato HTTP sin dejar
un camino operativo de escritura.

## Contactos y dominio comercial

Un mensaje entrante puede crear un contacto con origen `WHATSAPP`. Si el
contacto ya existe, la sincronización solo actualiza `lastActivityAt` cuando
el mensaje es más reciente. Nunca reemplaza nombre, correo, teléfono, país,
etiquetas o campos editados manualmente.

La llegada de un mensaje no crea oportunidades, mueve pipeline, crea demos,
ventas, pagos, seguimientos ni fulfillment. Esas acciones continúan siendo
manuales y usan los servicios de dominio existentes.

## Seguridad

- Todas las consultas filtran por `organizationId` del usuario autenticado.
- No se devuelven secretos de conexión.
- No se realizan llamadas externas en sincronización o reindexación.
- La sincronización y sus errores quedan auditados y llevan `requestId`.
- El provider no tiene operaciones `send`, `update` o `archive`.
