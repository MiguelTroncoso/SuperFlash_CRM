# Operational Workspace

El workspace reúne tres superficies en desktop y un flujo apilado en móvil:

1. Lista de conversaciones y filtros.
2. Conversación, mensajes y composer.
3. Panel del cliente y operación comercial.

El panel muestra un snapshot de respuesta, mensajes, ventas, ingresos, MRR, LTV
y próxima renovación. Los datos se calculan en backend a partir de relaciones
tenant-aware y se presentan como lectura operacional.

Las acciones rápidas son responsables de iniciar comandos existentes. Por
ejemplo, “Mover pipeline” invoca `OpportunitiesService`, “Crear venta” invoca
`SalesService` y “Crear fulfillment” invoca `FulfillmentService`. Esto mantiene
una única fuente de reglas e invariantes.

La interfaz utiliza tokens semánticos del design system, `min-w-0`, scroll
interno y columnas fluidas para evitar overflow en 360, 390, 412 y 768 px. La
preferencia clara/oscura/sistema se mantiene en el estado visual existente.

Atajos operativos:

- Enter: enviar texto.
- Shift+Enter: salto de línea.
- Ctrl/Cmd+K: abrir búsqueda global.
- Ctrl/Cmd+E: enfocar el composer.
- Esc: cerrar la selección activa.

La vista de configuración de la integración WhatsApp permanece separada bajo
`/settings/integrations/whatsapp` y no fue modificada por este sprint.
