# ADR-010: Transactional Outbox

## Estado

Aceptado.

## Decisión

Los eventos comerciales se insertan en `OutboxEvent` dentro de la misma transacción que muta el agregado. Un procesador posterior reclama lotes con `FOR UPDATE SKIP LOCKED`, entrega fuera del request, registra intentos y reintenta con backoff.

## Consecuencias

Un rollback no deja eventos huérfanos. La entrega es al menos una vez: `eventId` permite deduplicación de consumidores. Un listener fallido no cambia la respuesta de una transacción confirmada.
