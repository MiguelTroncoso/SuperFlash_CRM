# Sprint 35 — Commercial Operating Workflow

Sprint 35 organiza la operación diaria alrededor del flujo:

`Lead → Mensaje → Demo → Seguimiento → Venta → Cobro → Activación → Renovación`

## Dashboard operativo

`GET /api/v1/dashboard/operational` combina dos fuentes claramente separadas:

- `DailyMetric`: actividad informativa cargada manualmente o mediante CSV (conversaciones, demos, ventas informativas y gasto publicitario).
- `Sale` y `Payment`: fuente financiera real para ventas, facturación, cobros, utilidad y saldos.

El tenant se obtiene exclusivamente del JWT. Los filtros disponibles son rango de
fechas y país; las consultas no aceptan `organizationId` desde el cliente.

## Registro del día

`POST /api/v1/dashboard/daily-metrics` crea o actualiza una fila por combinación
`organizationId + metricDate + campaign + country`. La unicidad se protege en
PostgreSQL usando `campaignKey`, que evita la ambigüedad de valores `NULL`.

Las campañas se reutilizan desde `Campaign`. Si se informa un nombre sin una
campaña existente, se crea una campaña manual mínima y queda disponible para
futuras filas.

## Importación histórica

El CSV soporta `fecha`, `campaña`, `pais`, `conversaciones`, `demos`, `ventas`,
`gasto`, `facturación`, `moneda` y `notas`. La vista previa no persiste datos;
la importación final es transaccional e idempotente. No crea contactos ni ventas.

## Estados visibles y seguimiento

La interfaz presenta únicamente: Nuevo, Mensaje enviado, Demo enviada, No
responde, Hablar más adelante, Quiere comprar, Compró y Perdido. Los estados
legacy permanecen como aliases internos para compatibilidad. Las reglas de
seguimiento automático se calculan en el backend y los seguimientos manuales
persisten hasta que el operador cambia explícitamente el estado.

`Compró` no genera una venta automáticamente. El operador debe completar la
venta en Ventas, donde el backend crea el snapshot comercial, confirma el acuerdo
y registra los pagos.

## Ventas y stock

Nueva venta admite un cliente existente o un cliente rápido, usa comboboxes
buscables y filtra productos inactivos o sin stock rastreado. El backend mantiene
la resolución de precios, el snapshot, la concurrencia del inventario y la
creación de suscripciones/renovaciones.

Los pagos parciales se registran por `grossAmount`, `feeAmount` y `netAmount`.
Los saldos no se almacenan como campos derivados: se calculan desde la venta y
los pagos confirmados, descontando reembolsos.

## Permisos y auditoría

`operations.read` permite consultar el dashboard y las filas. `operations.manage`
permite registrar, editar e importar métricas. Owner y Admin tienen acceso total;
Sales puede operar; Viewer conserva acceso de lectura. Todas las mutaciones de
métricas incluyen actor, tenant, IP y `requestId` en AuditLog.
