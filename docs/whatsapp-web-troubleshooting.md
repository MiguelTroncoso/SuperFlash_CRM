# Troubleshooting WhatsApp Web Bridge

## `PENDING_CONFIGURATION` o `DISABLED`

Verificar `WHATSAPP_WEB_BRIDGE_ENABLED`,
`WHATSAPP_BRIDGE_INTERNAL_SECRET`, `WHATSAPP_BRIDGE_CHANNEL_KEY` y
`WHATSAPP_WEB_SESSION_ENCRYPTION_KEY`. Reiniciar el servicio después de cambiar
variables. No habilitarlo solo para ocultar un error.

## QR no aparece

El QR expira rápido y no se persiste. Verificar permisos `whatsapp.manage`,
estado `PAIRING`, healthcheck del bridge y que API y bridge compartan secreto y
channel key. Nunca copiar el QR a logs o tickets.

## Mensajes no llegan

Comprobar que el canal esté habilitado y `CONNECTED`, revisar el heartbeat y
que el mensaje sea posterior a `ingestionStartedAt`. Grupos, broadcasts,
mensajes propios, eventos de sistema y reacciones sin contexto se descartan por
diseño. Una colisión de idempotencia se reporta como duplicado y no se reintenta
de forma agresiva.

## `AUTHENTICATION_ERROR`

Desvincular la sesión, eliminarla desde WhatsApp Business y solicitar pairing
nuevo. No rotar números, evadir límites ni intentar automatizaciones.
