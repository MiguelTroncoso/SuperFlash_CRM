# Sprint 31 — Flujos comerciales y usabilidad del catálogo

## Nuevo Lead

`POST /api/v1/contacts/leads` es el punto de entrada comercial desde Pipeline. El backend normaliza teléfono y correo, reutiliza un Contacto existente dentro de la organización y crea una nueva Opportunity. La operación registra, dentro de la misma transacción, la etapa inicial, la atribución original cuando corresponde, el estado inicial del prospecto, el interés comercial, la actividad, el seguimiento opcional, la auditoría y el evento Outbox.

El teléfono se normaliza a E.164 con `libphonenumber-js`. Un contacto reutilizado conserva su nombre y atribución original. La categoría puede existir sin producto; cuando se selecciona un producto, la categoría se valida contra el catálogo activo del mismo tenant.

## Interés comercial

`Opportunity.categoryId` y `Opportunity.productId` representan interés, no una venta. `OpportunityInterestHistory` conserva cada cambio de interés con actor, tenant, fecha y motivo. Las respuestas de Pipeline, Contactos, Customer 360 y Smart Inbox exponen categoría, producto y campaña sin exponer información de otras organizaciones.

## Catálogo

El formulario de productos utiliza exclusivamente los enums de Prisma:

- `SUBSCRIPTION`, `CREDIT_PACKAGE`, `LICENSE`, `SERVICE`, `DIGITAL_ACCESS`, `OTHER`.
- `MANUAL`, `API`, `INVITATION`, `CREDENTIALS`, `DOWNLOAD`, `OTHER` para fulfillment.

Un slug vacío se omite para que el backend lo genere. “Sin categoría” se envía como `null`. Categorías y productos se pueden crear inline desde el drawer de Nuevo Lead, y la respuesta queda seleccionada automáticamente.

## Ventas

`/sales` ofrece `Nueva venta`. El flujo selecciona Contacto y Producto/Offer, crea una venta como borrador y permite confirmarla desde el detalle. La resolución de precio, snapshot, permisos, pagos y fulfillment permanecen en los servicios backend existentes.

## Permisos y límites

El flujo usa `contacts.create`, `opportunities.create`, `followups.create` cuando corresponde y `marketing.attribution.manage`. Sales mantiene estas capacidades en el seed de permisos. No se aceptan `organizationId` desde el cliente y todas las relaciones se comprueban dentro de la organización autenticada.

## Migración

La migración `20260811090000_commercial_ux_interest_flow` agrega el interés comercial y su historial. Las migraciones anteriores permanecen intactas.
