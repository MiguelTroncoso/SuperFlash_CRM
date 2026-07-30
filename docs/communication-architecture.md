# Communication Layer

Architecture v2.2 introduce una frontera extensible de canales de comunicación.
WhatsApp es el primer provider; el resto del CRM depende de contratos internos,
no de tipos, payloads ni errores de Meta.

## Límites

La implementación vive en `apps/api/src/modules/communication/`:

- `interfaces/`: contrato común de un provider.
- `providers/whatsapp/`: adaptación específica de WhatsApp.
- `services/`: health, métricas y traducción de eventos.
- `communication.webhook.controller.ts`: endpoint público del canal.

El boundary existente `/api/v1/integrations/whatsapp/*` permanece compatible.
El endpoint recomendado para el foundation es
`/api/v1/integrations/communication/whatsapp/webhook`.

## Contratos internos

Los eventos del provider se traducen a eventos del CRM y se entregan mediante
Transactional Outbox/ApplicationEventBus:

- `ConversationCreated`
- `ConversationUpdated`
- `MessageReceived`
- `MessageSent`
- `MessageDelivered`
- `MessageRead`
- `MessageFailed`
- `ConversationClosed`
- `ConversationAssigned`
- `ConversationArchived`

Los consumidores futuros solo deben usar estos eventos. Los payloads de Meta se
sanitizan y no atraviesan el contrato interno.

## Multiempresa y seguridad

El health se consulta por `organizationId` derivado del JWT. Los webhooks se
validan con token de verificación y firma HMAC-SHA256 antes de persistir eventos.
Los secretos no aparecen en respuestas, auditoría, métricas ni logs.

Si la configuración de entorno está incompleta, el provider se marca como
`PENDING_CONFIGURATION`, registra las variables faltantes por nombre y el resto
del CRM continúa operativo.

## Métricas

`CommunicationMetricsService` mantiene contadores seguros para eventos,
mensajes, errores de autenticación y clientes SSE. El endpoint protegido
`GET /api/v1/communication/metrics` devuelve JSON; su representación Prometheus
está disponible en `GET /api/v1/communication/metrics/prometheus` para un
scraper interno.

No se agregan integraciones externas ni tablas en este sprint.
