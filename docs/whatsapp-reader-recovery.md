# Recuperación del WhatsApp Reader

El checkpoint `WHATSAPP_WEB_READ_ONLY` conserva estado, último mensaje, reconexiones, errores, mensajes históricos descartados y duplicados evitados. Al reiniciar Docker, Baileys recupera la sesión del volumen y el API continúa desde la fecha de ingesta; no se importa historial ni se reprocesan mensajes aceptados.

Ante error de autenticación, el canal queda `AUTHENTICATION_ERROR` y requiere pairing o unlink explícito. Ante una caída transitoria, el reader aplica reconexión con backoff y mantiene el CRM funcionando aunque el canal esté desconectado.
