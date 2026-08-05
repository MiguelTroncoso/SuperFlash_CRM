# Cadencia de seguimientos

Sprint 30 reutiliza FollowUps, FollowUpHistory, Agenda y My Day. La
configuración tenant-scoped `ProspectEngagementConfig` inicia con días 2, 4, 7,
14 y 30, máximo tres intentos y SLA de primera respuesta de 15 minutos.

Los resultados se almacenan con `FollowUpResult`. La cadencia es una sugerencia
operacional: no envía mensajes ni mueve Pipeline. Las futuras reglas de
reactivación deben crear FollowUps internos idempotentes y pasar a
`FUTURE_REACTIVATION` al superar el máximo sin respuesta.
