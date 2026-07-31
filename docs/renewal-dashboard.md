# Renewal Dashboard

El dashboard calcula tarjetas de hoy, 7, 15 y 30 días, monto próximo, monto renovado, monto perdido, MRR renovable, tasa de renovación, clientes en riesgo, ingresos proyectados y recuperados.

Los valores monetarios se agrupan por moneda ISO 4217. No se realiza conversión implícita. La comparación contra el mes anterior usa `paidAt` y el mismo tenant.

El puente financiero expone gastos del mes y utilidad proyectada como lectura complementaria. No reemplaza los dashboards existentes de Revenue Intelligence ni Financial Intelligence.

El calendario agrupa por fecha UTC y conserva los filtros de país, producto, responsable y cliente. Los reportes permiten agrupar por mes, trimestre, año, producto, país, vendedor o cliente y exportar CSV con `renewals.export`.
