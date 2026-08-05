# Rendimiento de campañas

`GET /api/v1/marketing/performance` devuelve métricas por campaña y moneda con
filtros de período, campaña, moneda, país real, vendedor y producto. La
consulta usa agregaciones PostgreSQL tenant-aware y limita el resultado a 500
filas para evitar respuestas ilimitadas.

Incluye gasto, conversaciones, contactos, demos, ventas, revenue bruto y neto,
utilidad autorizada, CPA, Cost per Conversation/Contact/Demo, Gross/Net ROAS,
conversiones del embudo, ticket promedio y tiempo promedio hasta venta. Los
denominadores cero devuelven `null` y la UI muestra “—”. La dimensión actual de
la respuesta es campaña/moneda; las dimensiones jerárquicas y de comparación
avanzada quedan preparadas en DTO e índices para una iteración posterior.
