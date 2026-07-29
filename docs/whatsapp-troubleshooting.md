# Troubleshooting de WhatsApp

| Síntoma                              | Revisión                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Meta no verifica el callback         | Confirmar HTTPS, URL exacta, `hub.mode=subscribe` y verify token.                                                |
| `WHATSAPP_WEBHOOK_INVALID_SIGNATURE` | App Secret incorrecto, proxy modificando el body o header ausente.                                               |
| Healthcheck en `ERROR`               | Revisar WABA, Phone Number ID, permisos del System User y versión Graph.                                         |
| Mensaje queda en `QUEUED`            | Revisar Outbox, procesador API y conectividad de salida a `graph.facebook.com`.                                  |
| Plantilla rechazada                  | Debe existir localmente con idioma coincidente y estado `APPROVED`.                                              |
| Texto rechazado fuera de ventana     | El contacto no escribió en las últimas 24 horas; usar plantilla aprobada.                                        |
| Mensaje duplicado                    | Revisar Message ID/event key; las retransmisiones esperadas son idempotentes.                                    |
| No aparece contacto                  | Verificar que el número inbound sea válido en formato E.164 y que el webhook incluya `metadata.phone_number_id`. |

No resolver errores copiando tokens a logs o modificando la firma. Rotar
secretos desde Meta y volver a guardarlos cifrados en la conexión.
