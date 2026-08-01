# Executive Dashboard

El dashboard ejecutivo (`GET /api/v1/executive/dashboard`) es una proyección de lectura tenant-scoped. Calcula ventas, facturación, MRR, ARR, clientes, renovaciones, saldo pendiente y carga operativa desde Sales, Payments, Subscriptions, Renewals, Contacts, Fulfillments y Activations.

Las métricas se agrupan por moneda y no realizan conversión implícita. Los gráficos se basan en las mismas consultas persistidas que los KPIs; cuando no hay datos se muestra un estado vacío, no una cifra inventada.

La pantalla `/` consume React Query con stale time corto y ofrece enlaces a Business Intelligence y Agenda Operativa.
