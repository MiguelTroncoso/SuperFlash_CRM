# Arquitectura de solo lectura

## Decisión

WhatsApp Read Only es una capacidad de observación, no un canal de ejecución.
La frontera se modela con un provider que solo puede consultar el read model
local. Los servicios de CRM no dependen de tipos ni payloads de Meta.

```text
WhatsApp Business / webhook persistido
              |
              v
   WhatsApp read model local
              |
              v
   WhatsAppReadOnlyProvider
              |
              v
   ConversationImportService
       |                 |
       v                 v
 Smart Inbox       Revenue Intelligence
```

## Garantía de no escritura

No existe una operación del provider para enviar, editar, eliminar, marcar o
archivar. Las rutas antiguas que podrían haber accionado mensajes o estados de
conversación están bloqueadas antes de acceder a Prisma o a la red y devuelven
`405 WHATSAPP_READ_ONLY`. La UI tampoco muestra composer ni acciones de mensaje.

Esto preserva compatibilidad con clientes antiguos sin mantener una capacidad
de modificación del canal.

## Límites de responsabilidad

- **WhatsApp Read Only:** lectura, cursor, sincronización, health y métricas.
- **Contactos:** identidad manual; solo se actualiza actividad derivada.
- **Smart Inbox:** consulta y acciones manuales de CRM, sin escribir en
  WhatsApp.
- **Revenue Intelligence:** agregaciones de lectura, sin modificar el núcleo
  transaccional.
- **Operator:** responde en WhatsApp Business y decide las acciones
  comerciales dentro de SuperFlash.

No se implementan en esta versión Meta Graph API real, envío de mensajes,
webhooks de producción, WABA, migración histórica externa ni automatización de
ventas.
