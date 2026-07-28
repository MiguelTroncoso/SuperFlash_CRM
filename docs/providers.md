# Providers

`Provider` representa una fuente de entrega manual, interna o futura externa.
Su slug es único dentro de la organización y el soft delete conserva el
historial. Solo `ACTIVE` puede recibir nuevas asignaciones.

`ProviderProductMapping` relaciona un producto, plan y variante con un
proveedor. La resolución ordena por `priority` y luego por UUID para que la
selección sea determinista. Las relaciones se validan con claves compuestas de
tenant y no se ejecutan APIs externas en este Sprint.

Endpoints: `/api/v1/providers` y `/api/v1/provider-mappings`. Requieren los
permisos `providers.*` y `provider_mappings.*`.
