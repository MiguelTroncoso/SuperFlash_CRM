# Agenda Operativa

`GET /api/v1/agenda/operational` consolida seguimientos próximos, promesas de pago, renovaciones, ventas y pagos pendientes, fulfillments, activaciones, trials por vencer y clientes sin actividad reciente.

La consulta respeta el alcance del usuario: Sales ve sus seguimientos; Owner y Admin ven la cola completa de la organización. Cada elemento contiene referencia navegable al módulo responsable. La pantalla `/agenda` es responsive y muestra estados vacíos por sección.
