# WhatsApp Web Bridge

El bridge es un provider transitorio de solo lectura para que SuperFlash pueda
observar mensajes nuevos mientras se prepara la migración a WhatsApp Cloud API.
Vive en `apps/whatsapp-bridge` y nunca accede directamente a PostgreSQL.

## Flujo

1. Un usuario con `whatsapp.manage` habilita el canal y solicita pairing.
2. La API firma el control interno; el bridge genera un QR temporal.
3. El QR se guarda solo en memoria de la API, se muestra exclusivamente a
   `whatsapp.manage` y expira en dos minutos.
4. Tras `CONNECTED`, el bridge acepta únicamente mensajes nuevos.
5. La API resuelve el tenant por `channelKey`, deduplica el request y el
   `externalMessageId`, crea/actualiza Contact, Opportunity, Conversation,
   Message, Activity, AuditLog y Outbox en transacciones seguras.

El composer está deshabilitado para conversaciones del bridge. Las acciones de
CRM (pipeline, venta, seguimiento y fulfillment) continúan siendo manuales y
usan los servicios existentes.

## Configuración

Configurar el mismo `WHATSAPP_BRIDGE_INTERNAL_SECRET` y
`WHATSAPP_BRIDGE_CHANNEL_KEY` en API y bridge. `WHATSAPP_BRIDGE_API_URL` apunta
al bridge desde la API y al API desde el contenedor bridge; los overrides de
Docker Compose reflejan esa diferencia. El kill switch
`WHATSAPP_WEB_BRIDGE_ENABLED` es `false` por defecto.

La clave `WHATSAPP_WEB_SESSION_ENCRYPTION_KEY` es exclusiva del bridge y debe
tener al menos 32 caracteres aleatorios. Nunca se versionan valores reales.

## Eventos aceptados

Se aceptan texto, imagen, audio, vídeo, documento, ubicación, contactos y
sticker como tipo conocido. Medios no se descargan ni se transforman en este
sprint; se conserva solo metadata segura. Grupos, comunidades, newsletters,
broadcasts, estados, presencia, llamadas, reacciones sin contexto y mensajes
propios se descartan.
