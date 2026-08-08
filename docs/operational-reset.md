# Sprint 32 — Operational Reset

Sprint 32 simplifica la interfaz para el trabajo comercial diario sin crear
dominios, tablas ni reglas nuevas. El flujo principal es:

`Registrar Lead → Demo → Seguimiento → Cobro → Activación → Renovación`

## Menú principal

La navegación diaria queda reducida a:

- Dashboard
- Mi Día
- Leads
- Pipeline
- Ventas
- Cobros
- Renovaciones
- Catálogo
- Configuración

Las capacidades técnicas existentes —WhatsApp, Marketing, Revenue Intelligence,
Financial Intelligence, Providers, Fulfillment, credenciales, trials,
automatizaciones y la base maestra de contactos— permanecen disponibles desde
Configuración o mediante sus rutas autorizadas. No se eliminaron sus APIs ni
se cambiaron sus reglas.

## Flujo operativo

`/leads` reutiliza el endpoint transaccional existente de leads. El formulario
solo solicita nombre, teléfono, país, fuente, responsable, interés, producto,
estado inicial, próximo seguimiento y notas. Categorías y productos se pueden
crear inline y quedan seleccionados automáticamente.

Pipeline muestra nombre, país, producto, estado, último movimiento y próximo
seguimiento. El movimiento de una tarjeta utiliza el endpoint existente y
mantiene auditoría e historial.

Ventas conserva snapshots y pricing del backend. El drawer permite crear una
venta, confirmar el pago inicial y dejar el saldo pendiente visible. Cobros
consume las ventas y pagos existentes; registrar un pago crea y confirma el
Payment mediante los endpoints protegidos actuales.

## Alcance técnico

- No se modificó WhatsApp Cloud ni WhatsApp Web Bridge.
- No se agregaron modelos ni migraciones.
- No se modificó Marketing, Revenue Intelligence ni Financial Intelligence.
- Se agregó únicamente el próximo seguimiento al payload de listado del
  Pipeline usando la relación existente.
- La preferencia responsive y dark mode existentes se mantienen.
