# Flujo comercial operativo

El flujo principal de SuperFlash CRM es:

```text
Venta → Cliente automático → Cobro → Activación → Renovación → Historial
```

La venta es el centro de lectura y operación. El drawer de venta reúne los
datos de contacto, snapshots de catálogo, pagos, saldo calculado, suscripciones,
renovaciones, fulfillments, activaciones y actividad reciente.

## Identidad comercial

Las ventas tienen un número humano `SF-YYYYMMDD-######`, generado dentro de la
misma transacción que la venta y secuenciado por organización. Los UUID siguen
siendo identificadores técnicos de API, pero no se muestran en las superficies
operativas.

## Cobros e ingreso real

`Payment` conserva monto bruto, comisión, neto, reembolsos y método. El saldo no
se persiste: se calcula como total de la venta menos pagos netos confirmados más
reembolsos. El ingreso real financiero es el neto confirmado menos reembolsos.

Las comisiones se configuran por organización en `PaymentFeeConfig`. El motor
aplica porcentaje, cargo fijo, recargo internacional y conversión de moneda sin
conectar proveedores externos.

## Clientes

No hay un módulo principal separado de Clientes ni una navegación Customer 360.
La información de cliente se consulta desde ventas, cobros, renovaciones y
operaciones. Las rutas API legacy de clientes se conservan temporalmente para
compatibilidad con integraciones existentes.

## Integridad

La migración `20260816100000_master_commercial_close_financial` agrega numeración
de ventas, configuración de comisiones e invariantes monetarias sin modificar
migraciones históricas. El seed crea configuraciones base idempotentes y nunca
sobrescribe una configuración de comisión existente.
