# Activations

Una `Activation` es el resultado operativo de un fulfillment completado. Se
relaciona con el provider y opcionalmente con Subscription. Un índice parcial
impide más de una activación `PENDING`, `ACTIVE` o `SUSPENDED` por fulfillment.

Estados: `PENDING`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED` y `FAILED`.
Activar o suspender una activación actualiza la suscripción asociada cuando la
política lo permite y registra Activity, AuditLog y Transactional Outbox.
