# Customer Lifecycle

La ficha de ciclo de vida se consulta con `GET /api/v1/renewal-center/customers/:contactId`. Devuelve únicamente información del tenant autenticado:

- productos activos y snapshots comerciales;
- inicio, vencimiento y próxima renovación;
- historial completo de ciclos;
- cantidad de renovaciones;
- MRR y LTV agrupados por moneda;
- estado operativo actual.

El cliente no se fusiona ni se modifica automáticamente. La continuidad se obtiene por `Contact → Subscription → Renewal`; las ventas y pagos históricos permanecen inmutables.
