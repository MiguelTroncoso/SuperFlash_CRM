# Motivos comerciales

`LossReason` es un catálogo configurable por organización con tipos `LOSS`,
`OBJECTION` y `SILENCE`. Conserva `systemKey` estable, nombre visible, orden,
estado y soft delete. `ProspectReason` registra el motivo aplicado a un
contacto, conversación u oportunidad con nota, actor, timestamp y requestId.

El seed crea los motivos oficiales de pérdida y los submotivos de silencio.
Los registros utilizados no se eliminan físicamente; se desactivan o archivan.
