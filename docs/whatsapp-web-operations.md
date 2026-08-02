# Operación del WhatsApp Web Bridge

El servicio se ejecuta como `whatsapp-bridge` en la red Docker interna, sin
puertos públicos, usuario no root, healthcheck y límites de memoria. El volumen
`whatsapp_bridge_session` contiene únicamente sesión cifrada.

## Estados

`DISABLED`, `PAIRING`, `CONNECTED`, `DISCONNECTED`,
`AUTHENTICATION_ERROR` y `ERROR` se guardan en
`WhatsAppWebBridgeChannel`. `lastHeartbeatAt`, `lastMessageAt`, reconexiones,
duplicados e históricos descartados sirven para soporte sin almacenar
contenido sensible.

## Reconexión

Los reintentos usan backoff acotado entre 5 y 120 segundos. Una sesión
desvinculada no se reintenta automáticamente. El operador debe corregir la
autenticación y solicitar pairing nuevamente.

## Despliegue

En desarrollo:

```bash
docker compose up -d --build
```

En producción, usar `docker-compose.prod.yml` y el procedimiento existente de
`scripts/production/deploy.sh`. El servicio sigue deshabilitado si faltan
variables; el resto del CRM continúa iniciando.
