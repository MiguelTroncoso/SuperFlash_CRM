# WhatsApp Go-Live Checklist

Este checklist queda preparado para Sprint 26.2. En Sprint 26.1 no se ejecuta
ninguna conexión real.

## Antes de producción

- [ ] Crear y revisar la aplicación Meta Business.
- [ ] Verificar la cuenta WABA y el número oficial.
- [ ] Configurar `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_BUSINESS_ACCOUNT_ID`.
- [ ] Crear secretos únicos para `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN`.
- [ ] Confirmar `WHATSAPP_GRAPH_VERSION` soportada.
- [ ] Cargar variables únicamente en el gestor de secretos del VPS.
- [ ] Confirmar que los secretos no aparecen en logs, backups ni respuestas API.

## Webhook

- [ ] Publicar `/api/v1/integrations/communication/whatsapp/webhook` detrás de HTTPS.
- [ ] Ejecutar la verificación GET con el token configurado.
- [ ] Probar una firma válida y una firma alterada.
- [ ] Confirmar rate limiting y respuesta rápida 200.
- [ ] Confirmar que Outbox y el procesador tienen health operacional.

## Validación funcional

- [ ] Verificar estado del canal desde Configuración → Canales → WhatsApp.
- [ ] Confirmar recepción de un evento de prueba.
- [ ] Confirmar que el evento aparece en Smart Inbox y Timeline.
- [ ] Confirmar permisos `whatsapp.read`, `whatsapp.send` y `whatsapp.manage`.
- [ ] Confirmar aislamiento entre organizaciones.
- [ ] Ejecutar rollback documentado si falla la validación.

Hasta completar esta lista, el provider debe permanecer en `PENDING_CONFIGURATION`
o desconectado y el CRM debe seguir funcionando sin WhatsApp.
