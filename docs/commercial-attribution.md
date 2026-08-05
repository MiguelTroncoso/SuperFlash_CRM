# Atribución comercial

`Attribution` relaciona una organización con un Contact, conversación,
Opportunity, Trial o Sale y con la jerarquía de campaña. Una atribución
`ORIGINAL` identifica la primera fuente conocida del contacto y no se reemplaza
automáticamente. La corrección manual requiere `marketing.attribution.manage`,
motivo, actor, `requestId` y auditoría.

Una atribución `CONVERSION` puede diferir de la original. La venta conserva su
snapshot comercial; editar una campaña no cambia el histórico de la venta.
Todas las referencias se validan dentro del tenant y los índices parciales
evitan más de una atribución original activa por contacto.

Eventos Outbox: `OriginalAttributionAssigned`, `OriginalAttributionCorrected`
y `ConversionAttributionAssigned`.
