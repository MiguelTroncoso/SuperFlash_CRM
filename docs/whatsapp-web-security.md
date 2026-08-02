# Seguridad del WhatsApp Web Bridge

## Secretos y sesión

- La sesión Baileys se cifra con AES-256-GCM y una clave exclusiva del bridge.
- El volumen de sesión no se expone como bind mount de código ni por HTTP.
- QR, tokens, credenciales y payloads completos nunca se escriben en logs,
  AuditLog, Activity u Outbox.
- La API solo devuelve el QR a usuarios con `whatsapp.manage` y mientras no
  haya expirado.

## Canal interno

Cada request bridge→API y API→bridge incluye HMAC-SHA256 sobre
`timestamp.body`, `x-request-id` y `x-superflash-bridge-channel-key`. La API
valida una ventana de cinco minutos y registra un nonce persistido por tenant;
la misma firma o request no puede procesarse dos veces. La organización se
resuelve por `WhatsAppWebBridgeChannel.channelKey`, nunca desde el body.

## Aislamiento

Todas las consultas de ingesta se limitan a la organización resuelta. Las
relaciones a Contact, Opportunity, Conversation, Message, Activity, AuditLog
y Outbox mantienen el mismo `organizationId`. Un canal deshabilitado rechaza
eventos aun cuando el bridge conserve un proceso activo.

## Alcance read-only

No hay adaptador de envío, respuestas automáticas, bots, campañas, scraping de
historial, rotación de cuentas ni automatizaciones externas. Una migración
futura a Cloud API debe conservar estos límites durante el periodo de cambio.
