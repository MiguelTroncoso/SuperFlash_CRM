# Economía de pagos y rentabilidad

Sales, Payments, SaleItem, Fulfillment y Financial Intelligence conservan sus
fuentes existentes. El ingreso neto se lee de pagos confirmados: monto bruto
menos fee y reembolso atribuible. La utilidad es ingreso neto menos costo de
producto y costo de fulfillment; el margen es utilidad / ingreso neto y es
`null` si el ingreso neto es cero.

Las métricas de costo y utilidad no se aceptan desde el frontend ni se exponen
sin `commercial.costs.read` o `commercial.profit.read`. No se almacenan
balances derivados ni se mezclan monedas.
