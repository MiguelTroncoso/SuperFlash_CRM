# Rendimiento de campañas

`GET /api/v1/marketing/performance` devuelve métricas por campaña y moneda con
filtros de período, campaña, moneda, país real, vendedor y producto. La
consulta usa agregaciones PostgreSQL tenant-aware y limita el resultado a 500
filas para evitar respuestas ilimitadas.

Incluye gasto, conversaciones, contactos, demos, ventas, revenue bruto y neto,
utilidad autorizada, CPA, Cost per Conversation/Contact/Demo, Gross/Net ROAS,
conversiones del embudo, ticket promedio bruto y tiempo promedio hasta venta. Los
denominadores cero devuelven `null` y la UI muestra “—”. La dimensión actual de
la respuesta es campaña/moneda; las dimensiones jerárquicas y de comparación
avanzada quedan preparadas en DTO e índices para una iteración posterior.

El dashboard agrupa los importes por moneda y nunca suma CLP, USD u otras
monedas como si fueran equivalentes. El ticket promedio usa el total bruto de
la venta atribuida; el ingreso neto se mantiene disponible como métrica separada.
Cuando el filtro `to` se envía como fecha ISO sin hora, el día seleccionado es
inclusivo.
