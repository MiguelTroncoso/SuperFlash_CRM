# Smart Inbox

Smart Inbox es la superficie operativa principal de SuperFlash para trabajar
conversaciones de WhatsApp sin abandonar el CRM. Esta fase es una experiencia
operacional sobre los modelos existentes; no crea un segundo modelo de
conversaciones y no altera la integración Cloud API.

## Alcance

- Inbox paginado con vistas Inbox, Sin asignar, Mis conversaciones, Pendientes,
  Renovaciones, Cerradas, Archivadas y Papelera.
- Búsqueda por nombre, teléfono, correo y contenido de mensajes.
- Filtros por no leídos, pendientes, demos, ventas, renovaciones, país,
  responsable, producto, tags y fuente.
- Conversación con estado de ventana de 24 horas, estados de entrega y lectura,
  composer de texto y plantillas/respuestas rápidas preparadas.
- Panel operacional con contacto, pipeline, ventas, renovaciones, productos,
  seguimientos, métricas y acciones.
- Timeline que unifica mensajes, actividades, cambios de pipeline, ventas,
  pagos, fulfillment, renovaciones y entrega de credenciales.

## API

Los endpoints viven bajo `/api/v1/smart-inbox` y requieren `JwtAuthGuard`,
`PermissionsGuard` y los permisos existentes de cada acción. Las respuestas se
filtran siempre por `organizationId` del contexto autenticado; ese valor nunca
se acepta desde body, query o params.

`GET /events` entrega SSE por organización. Cada operación mutante publica una
señal liviana para invalidar las consultas React Query; los datos durables siguen
siendo PostgreSQL y los servicios de dominio existentes.

## Acciones

El Action Center llama directamente a los servicios existentes para mover una
oportunidad, crear una venta, agregar una nota, programar un seguimiento y crear
fulfillment o trial. Las acciones no duplican las reglas del Commercial Core.

## Límites deliberados

Esta fase no conecta Meta Business, no registra webhooks reales, no usa tokens
reales, no configura WABA y no migra conversaciones existentes. El envío real y
la recepción real continúan bajo la integración WhatsApp ya implementada.
