# Gastos

`Expense` es el registro histórico de un egreso. Conserva monto, moneda, fecha, proveedor, categoría, forma de pago, frecuencia, observaciones y referencia opcional del comprobante. El archivado es soft delete.

La organización se obtiene exclusivamente desde el contexto autenticado. Las categorías y campañas referenciadas deben pertenecer al mismo tenant.
