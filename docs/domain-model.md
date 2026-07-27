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
    User ||--o{ Opportunity : owns
    Opportunity ||--o{ Activity : tracks
    Opportunity ||--o{ FollowUp : schedules
    User ||--o{ FollowUp : responsible
    Opportunity ||--o{ Sale : converts
    Sale ||--o{ Payment : receives

    Contact ||--o{ ContactTag : tagged
    Tag ||--o{ ContactTag : classifies
    Organization ||--o{ Tag : defines

    Sale }o--o{ Product : includes
    Campaign ||--o{ Expense : funds
    User ||--o{ Activity : authors
    User ||--o{ AuditLog : acts
```

## Modelos

El esquema contiene únicamente `Organization`, `Role`, `Permission`, `User`, `Contact`, `Tag`, `ContactTag`, `Opportunity`, `PipelineStage`, `Activity`, `FollowUp`, `Product`, `Sale`, `Payment`, `Campaign`, `Expense` y `AuditLog`.

Todas las entidades usan UUID, timestamps y `deletedAt` nullable para soft delete. Las relaciones tenant-aware incluyen `organizationId`.

## Enumeraciones

- `PipelineStageCategory`: `OPEN`, `WON`, `ARCHIVED`.
- `ActivityType`: `MESSAGE`, `NOTE`, `DEMO`, `FOLLOWUP`, `PAYMENT`, `SALE`, `STATUS_CHANGE`, `SYSTEM`.
- `UserStatus`, `FollowUpPriority`, `FollowUpStatus`, `SaleStatus` y `PaymentStatus` completan los estados operativos del dominio.

Las etapas del pipeline son datos configurables por organización; los nombres del pipeline inicial están únicamente en el seed.

## Auditoría e índices

`AuditLog` conserva actor, acción, tabla, registro, valores anterior/nuevo, IP y fecha. El esquema indexa las claves de tenant, estado, teléfono normalizado, país, campaña, usuario y timestamps de creación, además de las claves de relación principales.
