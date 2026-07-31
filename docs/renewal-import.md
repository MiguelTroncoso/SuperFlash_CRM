# Importación histórica de renovaciones

La importación CSV tiene dos pasos:

1. `POST /api/v1/renewal-center/import/preview` valida filas sin mutar datos.
2. `POST /api/v1/renewal-center/import` crea únicamente filas válidas dentro de una transacción y registra auditoría.

Encabezados soportados: `Cliente`, `Producto`, `Fecha inicio`, `Fecha vencimiento`, `Monto`, `Moneda`, `Estado`, `Responsable`, `Notas`. El cliente y producto deben resolver una suscripción existente del mismo tenant; no se inventan suscripciones, ventas ni costos históricos.

Los ciclos duplicados se detectan por `organizationId + subscriptionId + cycleKey` y se omiten de forma idempotente. Los estados históricos `Renovado`/`Pagado` se conservan en Renewal, pero no fabrican un Payment o Sale que no existan en la fuente. El detalle queda marcado como importación histórica.

El importador no envía mensajes, no actualiza Pipeline y no llama integraciones externas.
