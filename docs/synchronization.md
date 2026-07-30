# Sincronización de conversaciones

## Flujo

`ConversationImportService` ejecuta una sincronización incremental por
organización:

1. Reclama atómicamente el checkpoint.
2. Procesa los eventos inbound pendientes del read model local.
3. Lee mensajes entrantes después del cursor `(createdAt, id)`.
4. Actualiza únicamente la actividad derivada del contacto.
5. Persiste el nuevo cursor, contadores y última ejecución exitosa.
6. Registra auditoría y un evento durable de sincronización completada.

El orden por fecha e identificador hace que el cursor sea determinista. Un
mensaje que ya quedó detrás del cursor no se vuelve a importar. La unicidad
del `externalMessageId` del modelo de WhatsApp protege además el ingreso
repetido de eventos.

## Checkpoint

`CommunicationSyncCheckpoint` es tenant-aware y tiene una fila por
`organizationId + channel`. Conserva:

- estado `IDLE`, `RUNNING`, `SUCCEEDED` o `FAILED`;
- cursor de fecha e identificador;
- contadores de mensajes, conversaciones y contactos;
- duplicados evitados y errores;
- próxima reintento y último error seguro.

La reclamación expira después de diez minutos para permitir recuperación de un
proceso detenido. Los fallos usan backoff exponencial acotado a cinco minutos.
Al iniciar el módulo se revisan checkpoints fallidos cuyo reintento ya está
disponible.

## Reindexación

`Reindexar` reconstruye los índices derivados desde las conversaciones y
mensajes persistidos. No cambia campos manuales de Contact, no crea ventas ni
llama a un proveedor externo. Es útil después de una recuperación o de una
reconstrucción del read model.

## Idempotencia y límites

- Cada ejecución tiene un solo owner por tenant.
- El lector procesa páginas de hasta 500 mensajes.
- La clave ordenada `(createdAt, id)` permite reanudar sin perder el borde.
- Los eventos inbound se deduplican por `organizationId + externalMessageId`.
- Un error no confirma el checkpoint como exitoso; queda disponible para
  recuperación con backoff.

## Observabilidad

El health del canal muestra estado, totales, último webhook, checkpoint,
errores y métricas. Las métricas internas también se exponen en formato JSON y
Prometheus. Ninguna métrica contiene tokens, secretos o payloads completos de
WhatsApp.
