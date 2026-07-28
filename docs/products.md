# Productos, planes y variantes

## Producto

Un producto se identifica dentro de su organización mediante `slug`; el SKU es opcional y también es
único entre productos activos del tenant. `ProductType` describe el negocio (`SUBSCRIPTION`,
`CREDIT_PACKAGE`, `LICENSE`, `SERVICE`, `DIGITAL_ACCESS`, `OTHER`) y `FulfillmentMode` describe cómo se
entrega (`MANUAL`, `API`, `INVITATION`, `CREDENTIALS`, `DOWNLOAD`, `OTHER`). Seleccionar `API` no ejecuta
integraciones: solo prepara el catálogo para un Sprint futuro.

`allowsDemo=false` obliga a que `demoDurationHours` sea nulo; cuando es verdadero la duración queda entre
1 y 168 horas. `metadata` debe ser un objeto JSON sin tokens, secretos, credenciales ni contraseñas.

Los campos históricos `price`, `currency` y la categoría textual se conservan temporalmente para no
romper oportunidades y snapshots anteriores. El catálogo nuevo no los usa: los precios comerciales
provienen de `PriceBookEntry`.

## Planes y variantes

Los planes pertenecen a un producto y usan segmentos (`END_CUSTOMER`, `RESELLER`, `SUPER_RESELLER`,
`ADMIN`, `BUSINESS`, `ANY`) y períodos (`DAY`, `WEEK`, `MONTH`, `YEAR`, `ONE_TIME`). Los paquetes de
créditos deben informar `creditAmount`. Una variante puede pertenecer a un plan del mismo producto y
sus `attributes` solo pueden ser un objeto JSON raíz.

Archivar es reversible y no elimina hijos ni historial. Restaurar deja el producto/plan/variante inactivo
hasta que un usuario autorizado lo active explícitamente. Para resolver un precio, el producto debe tener
`active=true`, `status=ACTIVE` y `deletedAt=NULL`; los planes y variantes deben tener `active=true` y
`deletedAt=NULL`.

Una variante ligada a un plan requiere que el request informe ese mismo `planId`. Una variante sin plan
puede resolverse sin `planId`; las relaciones siempre se validan dentro de la organización y también en
la consulta final de precios.
