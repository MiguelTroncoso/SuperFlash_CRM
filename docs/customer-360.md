# Customer 360

`GET /api/v1/customer-360/:contactId` compone el contexto del cliente dentro del tenant autenticado: contacto, oportunidades, actividades, seguimientos, conversaciones, ventas, pagos, suscripciones, renovaciones, fulfillment, activaciones, timeline y métricas.

La ruta devuelve 404 para contactos de otra organización. Las credenciales se proyectan únicamente con identificador, estado, vencimiento e instrucciones; los valores sensibles permanecen enmascarados. El frontend `/customers/:id` presenta esta información como una vista de lectura y enlaza de vuelta al CRM existente.
