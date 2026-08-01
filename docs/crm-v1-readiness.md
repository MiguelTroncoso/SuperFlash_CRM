# CRM v1 Readiness

Sprint 28 consolida la lectura ejecutiva y la madurez operativa del CRM sobre los dominios existentes. La base transaccional sigue siendo la fuente de verdad; las nuevas rutas son read-side y no duplican reglas de Sales, Payments, Renewals, Fulfillment ni WhatsApp.

Checklist:

- Dashboard ejecutivo alimentado por datos persistidos.
- Business Intelligence con vistas por dimensión y filtros.
- Customer 360 tenant-scoped y sin secretos.
- Agenda operativa consolidada.
- Pipeline con antigüedad, probabilidad, prioridad y valor ponderado.
- Búsqueda global tenant-scoped y Command Palette.
- Nueva migración aislada; migraciones anteriores sin cambios.
- Respuestas agrupadas por moneda y sin conversiones implícitas.

Fuera de alcance: IA, predicciones automáticas, conexión Meta real, nuevos proveedores externos y cambios en las reglas transaccionales.
