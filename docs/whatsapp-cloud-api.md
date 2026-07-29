# WhatsApp Cloud API

La integración usa exclusivamente la WhatsApp Business Platform Cloud API
oficial. No se implementan bots, respuestas automáticas ni proveedores
alternativos.

## Modelo

Cada organización puede tener una `WhatsAppConnection` con WABA, Phone Number
ID y secretos cifrados con AES-256-GCM. Las conversaciones y mensajes siempre
incluyen `organizationId`; las relaciones compuestas de Prisma impiden cruzar
tenants. `WhatsAppMessage` conserva el tipo, dirección, estado, contenido
sanitizado y el identificador de Meta.

Los secretos nunca salen en respuestas públicas. La UI muestra una máscara y
los campos vacíos conservan el secreto existente durante una actualización.

## Flujo inbound

1. Meta verifica el callback mediante `GET /api/v1/integrations/whatsapp/webhook`.
2. `POST` valida la firma HMAC-SHA256 con el App Secret descifrado.
3. El payload sanitizado se persiste como `WhatsAppWebhookEvent` y se encola en
   Transactional Outbox.
4. El procesador resuelve el contacto por teléfono E.164, crea o reutiliza la
   conversación y registra `Activity MESSAGE`.
5. Solo se crea una oportunidad en `Nuevo Lead` cuando el contacto no tiene una
   oportunidad comercial abierta.

Los identificadores externos de Meta y las claves de evento son únicos por
organización, por lo que una retransmisión no duplica mensajes, actividades ni
oportunidades.

## Flujo outbound

La bandeja encola texto o plantillas aprobadas. El procesador usa el Graph API
versionado, aplica reintentos con backoff y guarda el estado `QUEUED`, `SENT` o
`FAILED`. Los estados `DELIVERED`, `READ` y `FAILED` posteriores llegan desde
webhook. Una respuesta libre requiere una ventana de 24 horas abierta; fuera
de ella solo se acepta una plantilla aprobada.

## Permisos

- `whatsapp.read`: conexión, conversaciones y mensajes.
- `whatsapp.send`: envío outbound.
- `whatsapp.manage`: guardar, probar y desconectar.
- `whatsapp.templates.read`: consultar y sincronizar plantillas.
- `whatsapp.conversations.assign`: asignar responsables.

Las operaciones autenticadas requieren JWT, permisos y tenant del contexto. El
webhook es público únicamente para verificación y recepción firmada.
