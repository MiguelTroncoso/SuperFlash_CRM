# Estado conversacional del prospecto

`ProspectConversationState` es operacional y no sustituye `PipelineStage`.
Cada organización tiene como máximo un estado vigente por contacto y el cambio
genera `ProspectConversationStateHistory`, Activity, AuditLog y Outbox.

Estados iniciales: `NEW_UNANSWERED`, `RESPONDED`, `ACTIVE_CONVERSATION`,
`WAITING_CUSTOMER`, `DEMO_REQUESTED`, `DEMO_SENT`, `DEMO_ACTIVE`,
`DEMO_EXPIRED`, `FOLLOW_UP_SCHEDULED`, `NO_RESPONSE_FOLLOW_UP_1/2/3`,
`FUTURE_REACTIVATION`, `NOT_INTERESTED`, `LOST` y `PURCHASED`.

Los cambios manuales no mueven automáticamente el pipeline ni envían mensajes.
