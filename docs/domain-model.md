# Modelo de dominio CRM

## Relaciones principales

```mermaid
erDiagram
    Organization ||--o{ User : contains
    Organization ||--o{ Contact : contains
    Organization ||--o{ Opportunity : contains
    Organization ||--o{ Activity : contains
    Organization ||--o{ FollowUp : contains
    Organization ||--o{ Sale : contains
    Organization ||--o{ SaleItem : contains
    Organization ||--o{ Payment : contains
    Organization ||--o{ Campaign : contains
    Organization ||--o{ Expense : contains
    Organization ||--o{ AuditLog : records

    Organization ||--o{ Role : defines
    Role }o--o{ Permission : grants
    Role ||--o{ User : assigns

    User ||--o{ Contact : manages
    Contact ||--o{ Opportunity : owns
    Opportunity }o--|| PipelineStage : uses
    Opportunity }o--o| Campaign : attributes
    Opportunity }o--o| Product : interests
    User ||--o{ Opportunity : owns
    Opportunity ||--o{ Activity : tracks
    Opportunity ||--o{ FollowUp : schedules
    FollowUp ||--o{ FollowUpHistory : records
    FollowUp ||--o{ Activity : relates
    User ||--o{ FollowUpHistory : changes
    Opportunity ||--o{ OpportunityStageHistory : changes
    PipelineStage ||--o{ OpportunityStageHistory : receives
    User ||--o{ OpportunityStageHistory : changes
    User ||--o{ FollowUp : responsible
    Opportunity ||--o{ Sale : converts
    Sale ||--o{ SaleItem : contains
    SaleItem }o--o| Product : snapshots
    Sale ||--o{ Payment : receives

    Organization ||--o{ ProductCategory : organizes
    ProductCategory ||--o{ Product : groups
    Product ||--o{ ProductPlan : offers
    Product ||--o{ ProductVariant : has
    ProductPlan ||--o{ ProductVariant : scopes
    Organization ||--o{ PriceBook : defines
    PriceBook ||--o{ PriceBookEntry : contains
    Product ||--o{ PriceBookEntry : priced
    ProductPlan ||--o{ PriceBookEntry : priced
    ProductVariant ||--o{ PriceBookEntry : priced
    PriceBookEntry ||--o{ PriceHistory : changes

    Contact ||--o{ ContactTag : tagged
    Tag ||--o{ ContactTag : classifies
    Organization ||--o{ Tag : defines

    Campaign ||--o{ Expense : funds
    User ||--o{ Activity : authors
    User ||--o{ AuditLog : acts
```

## Modelos

El esquema contiene `Organization`, `Role`, `Permission`, `User`, `Contact`, `Tag`, `ContactTag`, `Opportunity`, `OpportunityStageHistory`, `PipelineStage`, `Activity`, `FollowUp`, `FollowUpHistory`, `ProductCategory`, `Product`, `ProductPlan`, `ProductVariant`, `PriceBook`, `PriceBookEntry`, `PriceHistory`, `Sale`, `SaleItem`, `Payment`, `Campaign`, `Expense` y `AuditLog`.

Todas las entidades tenant-aware usan UUID, timestamps y `organizationId`. El soft delete se representa mediante `deletedAt`, excepto `AuditLog`, que es append-only e inmutable.

## Oportunidades y ventas

`Opportunity.expectedAmount` es una proyección comercial antes del cierre. `OpportunityStageHistory` es append-only y registra la etapa anterior, nueva etapa, actor, motivo y fecha. `Sale.subtotal` y `Sale.total` representan importes confirmados de una venta. Una oportunidad puede tener como máximo una venta activa principal; las ventas canceladas históricas se conservan.

`SaleItem` es explícito y conserva `productNameSnapshot`, `skuSnapshot`, `quantity`, `unitPrice`, `total` y `currency`. Los snapshots no cambian cuando se actualiza el producto de referencia.

## Enumeraciones

- `PipelineStageCategory`: `OPEN`, `WON`, `LOST`. El archivado es independiente y vive en `Opportunity.archivedAt`.
- `ActivityType`: `MESSAGE`, `NOTE`, `DEMO`, `FOLLOWUP`, `PAYMENT`, `SALE`, `STATUS_CHANGE`, `SYSTEM`.
- `FollowUpStatus`: `PENDING`, `COMPLETED`, `RESCHEDULED`, `CANCELLED`.
- `FollowUpHistoryAction`: `CREATED`, `UPDATED`, `COMPLETED`, `CANCELLED`, `RESCHEDULED`, `ASSIGNEE_CHANGED`, `ARCHIVED`, `RESTORED`.
- `UserStatus`, `FollowUpPriority`, `SaleStatus` y `PaymentStatus` completan los estados operativos.
- `ProductType`, `FulfillmentMode`, `CustomerSegment`, `BillingPeriodUnit`, `ProductStatus` y `PriceBookStatus` gobiernan el catálogo y la resolución de precios.

Las etapas del pipeline son configurables por organización. Los nombres iniciales existen únicamente en el seed.

`PipelineStage.systemKey` es opcional y estable. Solo las ocho etapas oficiales lo reciben desde seed; las etapas personalizadas quedan con `NULL`. Las consultas de Mi Día usan este identificador, no el nombre visible.

`FollowUpHistory` no tiene `updatedAt` ni `deletedAt`: la aplicación solo inserta eventos. `FollowUp` referencia a oportunidad, responsable, actores y reemplazo mediante claves compuestas con `organizationId`, evitando relaciones cruzadas entre tenants.

El estado público de una oportunidad se deriva en servidor: `ARCHIVED` cuando existe `archivedAt`, `WON` o `LOST` según la categoría de su etapa y `OPEN` en los demás casos.

## Integridad multiempresa

Cada entidad tenant-aware expone `@@unique([organizationId, id])`. Las relaciones sensibles referencian pares `(organizationId, id)`, de modo que una fila de una organización no puede apuntar a una fila de otra organización, incluso mediante SQL directo.

Teléfonos normalizados de contactos, SKU de productos y `opportunityId` de ventas activas usan índices únicos parciales en PostgreSQL. PostgreSQL permite múltiples valores `NULL` en los índices únicos compuestos; los índices parciales además excluyen filas eliminadas o ventas canceladas.

Los slugs/códigos activos del catálogo, el default de price books y las combinaciones activas de entradas
de precio también están protegidos por índices parciales. Los montos del catálogo son `Decimal(18,2)`;
`PriceHistory` es append-only y conserva cada alta o modificación de precio.

## Auditoría y checks

`AuditLog` conserva actor, acción, tabla, registro, valores anterior/nuevo, IP y fecha. No tiene `updatedAt` ni `deletedAt`; la aplicación debe tratarlo como append-only y nunca actualizarlo o eliminarlo.

La migración agrega checks para órdenes positivas, cantidades mayores que cero y montos no negativos. En pagos valida `netAmount <= grossAmount`.
