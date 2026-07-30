# Realtime Roadmap

Architecture v2.1 deja preparado un canal SSE para el Smart Inbox. El stream
está autenticado con Bearer Token, aislado por `organizationId` y emite eventos
de invalidación con `requestId` cuando existe.

## Implementado en esta fase

- `GET /api/v1/smart-inbox/events`.
- Heartbeat periódico para detectar conexiones inactivas.
- Publicación liviana después de acciones del workspace.
- React Query invalida listas, detalle y timeline sin recargar la página.
- El cierre de una suscripción aborta el lector SSE del navegador.

## Evolución futura

- Broker durable para fan-out entre réplicas de API.
- Redis Pub/Sub o un gateway WebSocket cuando la escala operacional lo requiera.
- Presencia, typing indicators y acknowledgements por mensaje.
- Métricas de conexiones, latencia, reconexiones y eventos descartados.
- Backoff exponencial y reconexión autenticada.

El stream actual no conecta Meta, no recibe webhooks y no sustituye el
Transactional Outbox. La base durable sigue siendo el backend existente.
