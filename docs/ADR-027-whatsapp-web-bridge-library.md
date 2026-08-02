# ADR-027 — WhatsApp Web Bridge Library

## Estado

Aceptado para Architecture v2.8. Riesgo operacional aceptado y pairing de
producción pendiente.

## Decisión

El provider transitorio usa `@whiskeysockets/baileys` dentro de
`apps/whatsapp-bridge`. Baileys permite mantener el proceso separado del API,
evitar un navegador automatizado y recibir eventos de WhatsApp Web sin
acoplar modelos Meta al dominio.

El bridge expone únicamente un healthcheck y controles internos firmados. No
expone puertos públicos, no envía mensajes, no importa historial y no imprime
QR o secretos. La sesión se persiste únicamente cifrada con AES-256-GCM.

## Alternativas descartadas

`whatsapp-web.js` requeriría Chromium/Puppeteer y aumentaría superficie,
memoria y complejidad operacional para un provider explícitamente temporal.
Ninguna librería se considera equivalente a la API oficial de Meta para una
operación definitiva; la migración a Cloud API queda documentada como salida.
