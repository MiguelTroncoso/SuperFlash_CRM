# Tiempos del ciclo comercial

Los tiempos se derivan de timestamps persistidos: primer contacto a demo,
primer contacto a venta, demo a venta, venta a primer pago confirmado y pago a
activación. Se clasifican en `SAME_DAY`, `ONE_DAY`, `TWO_TO_THREE_DAYS`,
`FOUR_TO_SEVEN_DAYS`, `EIGHT_TO_FOURTEEN_DAYS` y `OVER_FOURTEEN_DAYS`.

Ventas canceladas y pagos reembolsados no se cuentan como conversiones netas.
Pagos parciales se consideran cuando existe confirmación; una activación válida
es la registrada por el dominio de Activations. Las múltiples demos se asocian
por su primera demo válida salvo que un reporte documente otra definición.
