# Modelo de dominio CRM

## Gobernanza arquitectónica

Architecture v1.0 — Commercial Core está **APPROVED / FROZEN** desde el commit
`d4ee72096edb6d691675a8a518a6ee3aeb610a18`, con veredicto **APPROVED WITH
FOLLOW-UP**. El mapa oficial de versiones, dominios y decisiones está en el
[SuperFlash Platform Architecture Book](architecture/README.md).

Revenue Intelligence pertenece a Architecture v2.0 y permanece como
**ROADMAP / NOT IMPLEMENTED**. Las plataformas externas serán futuras fuentes
de tráfico; la inteligencia del negocio no se trasladará fuera de SuperFlash
Platform.

## Comercial endurecido

`Sale` es el acuerdo comercial, `Payment` el movimiento financiero, `Subscription` el ciclo recurrente y `Renewal` la identidad histórica de cada periodo. `SaleItem`, `Subscription` y `Renewal` persisten snapshots versionados; no se consulta el catálogo vivo para reconstruir acuerdos históricos.

`OutboxEvent` se persiste dentro de la misma transacción que cambia el agregado. Un procesador asíncrono entrega eventos con reintentos y `eventId`; los consumidores deben ser idempotentes. `requestId` se propaga por HTTP, AuditLog, Activity, Outbox y logs.

PostgreSQL protege fórmulas de importes, no negatividad, límites de reembolso, ciclos `CUSTOM`, orden de periodos y append-only de AuditLog/Activity. Las invariantes que requieren varias filas, como el balance y la política de cancelación, permanecen en servicios transaccionales bajo lock.

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
de precio también están protegidos por índices parciales. La combinación de entrada incluye el periodo
(`validFrom`, `validUntil`) y PostgreSQL usa `NULLS NOT DISTINCT` para los límites abiertos. Los montos
del catálogo son `Decimal(18,2)`; `PriceHistory` es append-only y conserva cada alta o modificación de
precio. `PriceBook.priority` está limitada a `-10000..10000`.

## Auditoría y checks

`AuditLog` conserva actor, acción, tabla, registro, valores anterior/nuevo, IP y fecha. No tiene `updatedAt` ni `deletedAt`; la aplicación debe tratarlo como append-only y nunca actualizarlo o eliminarlo.

La migración agrega checks para órdenes positivas, cantidades mayores que cero y montos no negativos. En pagos valida `netAmount <= grossAmount`.

## Núcleo comercial (Sprint 8–11)

```mermaid
erDiagram
    Opportunity ||--o{ Sale : converts
    Contact ||--o{ Sale : buys
    Sale ||--|{ SaleItem : contains
    Sale ||--o{ Payment : receives
    SaleItem }o--o| Product : references
    SaleItem }o--o| ProductPlan : references
    SaleItem }o--o| ProductVariant : references
    SaleItem ||--o| Subscription : starts
    Subscription ||--o{ Renewal : schedules
    Renewal }o--|| Sale : source
    Renewal ||--o| Sale : generates
```

`Sale` representa el acuerdo comercial y sus `SaleItem` conservan un snapshot JSON más campos tipados del catálogo. El snapshot es la fuente histórica de la venta, por lo que los cambios posteriores del catálogo no alteran el acuerdo.

`Payment` guarda importes bruto, comisión, neto y reembolsado. El saldo se calcula como `Sale.total - sum(Payment.netAmount - Payment.refundedAmount)` únicamente sobre pagos confirmados o reembolsados; no existen columnas derivadas `remainingBalance` ni `paidAmount`.

`Subscription` nace de un `SaleItem` y conserva su snapshot. `Renewal` pertenece a una suscripción y a la venta fuente; al pagarse crea una venta nueva con sus propios ítems y pago, sin modificar la venta anterior.

Las confirmaciones de ventas, confirmaciones de pagos, creación/pago de renovaciones y conversiones de oportunidades bloquean la fila agregada con `FOR UPDATE`. Las operaciones se mantienen dentro de transacciones cortas y escriben eventos durables en Outbox dentro del commit.
