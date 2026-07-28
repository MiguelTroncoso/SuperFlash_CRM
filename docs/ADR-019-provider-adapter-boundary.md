# ADR-019 — Provider Adapter Boundary

## Estado

Aceptado para Architecture v1.1, pendiente de revisión formal.

## Decisión

El dominio depende del contrato `ProviderAdapter`, no de APIs de proveedores.
Manual y Mock son adaptadores iniciales; los adaptadores externos futuros se
incorporarán sin contaminar Fulfillment con detalles de infraestructura.
