# Seguridad del WhatsApp Reader

- El reader vive en la red Docker privada y no publica puertos.
- Los endpoints internos requieren Bearer de servicio y organización configurada; no son parte de la API pública del CRM.
- El API no acepta eventos con una fecha anterior al inicio de ingesta.
- Cada mensaje usa `externalMessageId` e idempotency key para evitar duplicados.
- La sesión se conserva en un volumen dedicado con permisos de aplicación; no se versiona ni se imprime en logs.
- Cada archivo de sesión se cifra con AES-256-GCM usando `WHATSAPP_READER_AUTH_KEY`; la clave solo existe como secreto del proceso.
- El QR se oculta cuando el estado pasa a `CONNECTED`.
- No se descargan archivos multimedia ni se guardan secretos en Activity, AuditLog u Outbox.
