# Public Commerce Roadmap

Este documento registra una capacidad futura de SuperFlash Platform. No forma
parte de Architecture v1.0 ni v1.1 implementadas y no autoriza cambios en el
núcleo transaccional actual.

## Límite futuro

Una futura capa de commerce público podrá presentar productos marcados como
`publicVisible` y sus precios aprobados por el catálogo. El diseño deberá
mantener separado el workspace interno del canal público, con contratos de
lectura explícitos y aislamiento por organización.

## Fuera de alcance actual

No se implementan en este Sprint ni en el repositorio actual:

- storefront público;
- carrito;
- checkout;
- pago público;
- compras sin autenticación;
- gestión de clientes anónimos;
- fulfillment público;
- nuevas tablas o migraciones para commerce.

## Principios para una futura aprobación

- El catálogo y pricing existentes seguirán siendo la fuente de verdad.
- Las reglas de precio mínimo, moneda, vigencia, stock y disponibilidad no se
  duplicarán en el canal público.
- La compra pública deberá crear acuerdos mediante los mismos servicios de
  dominio que utiliza el workspace, nunca mediante escrituras directas.
- Los pagos deberán usar el dominio Payments y sus controles de idempotencia,
  auditoría y conciliación.
- La entrega continuará gobernada por Fulfillment y Providers.
- Cualquier exposición de datos deberá ser explícita, tenant-aware y sin
  secretos operativos.

## Dependencias y decisiones pendientes

Antes de iniciar este roadmap se deberá aprobar una versión arquitectónica
posterior que defina identidad pública, sesiones, límites de abuso, impuestos,
monedas, inventario reservado, consentimiento y observabilidad del canal.

La implementación futura deberá incluir ADRs y pruebas de concurrencia para
carrito, checkout, pago, expiración de reservas e idempotencia. Hasta entonces,
`publicVisible` es únicamente una capacidad de catalogación para el workspace y
no implica que exista una tienda pública.
