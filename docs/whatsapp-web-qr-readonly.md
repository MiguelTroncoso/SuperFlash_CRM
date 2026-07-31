# WhatsApp Web QR Read Only

Architecture v2.4 incorpora un adaptador aislado para observar el WhatsApp Business actual mediante WhatsApp Web y pairing QR. Usa Baileys, nunca Selenium, Chromium automatizado ni Meta Cloud API.

El servicio `whatsapp-reader` no accede a PostgreSQL. Mantiene la sesión en un volumen privado y envía al API únicamente eventos normalizados mediante un token de servicio. El API valida tenant, checkpoint, deduplicación y fecha de ingesta antes de actualizar el read model.

El adaptador es 100% read-only: ignora `fromMe`, grupos, canales, estados, broadcasts y protocol messages; no envía, responde, borra, archiva ni marca como leído. Los adjuntos se representan solo con metadatos.

## Flujo

1. `docker compose -f docker-compose.prod.yml up -d` levanta el reader privado.
2. `scripts/production/pair-whatsapp-reader.sh` valida API, Redis y reader, y mantiene la terminal esperando el QR.
3. El operador escanea el código desde WhatsApp Business.
4. El reader publica `CONNECTED`; desde ese instante se aceptan solo mensajes nuevos. El historial anterior se descarta y contabiliza.

La pantalla de Canales muestra el mismo QR, el vencimiento, checkpoint, reconexiones, duplicados e históricos descartados. Nunca muestra la sesión ni secretos.
