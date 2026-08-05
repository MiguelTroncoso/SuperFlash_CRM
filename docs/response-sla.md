# SLA de respuesta

`WhatsAppConversation` conserva `firstInboundMessageAt`,
`firstAgentResponseAt`, `firstResponseDurationSeconds` y
`firstResponseBucket`. Los buckets son `UNDER_5_MIN`, `UNDER_15_MIN`,
`UNDER_60_MIN`, `OVER_60_MIN` y `UNANSWERED`.

La primera respuesta debe representar una respuesta humana válida; notas,
mensajes internos y eventos del sistema no cuentan. El valor por defecto por
organización es 15 minutos. Las correcciones retrospectivas requieren permiso,
auditoría y motivo.
