# SuperFlash Platform Architecture Book

Fuente oficial de verdad arquitectónica para SuperFlash Platform.

## Propósito

Este libro define los límites de los dominios, los principios, el lenguaje y las
reglas de evolución de la plataforma. La documentación describe decisiones y
roadmaps; no autoriza por sí sola la implementación de funcionalidades fuera de
la arquitectura aprobada.

## Principios

- Feature First y Clean Architecture, con responsabilidades explícitas por dominio.
- Multiempresa por diseño: toda operación tenant-aware se aísla por organización.
- El dominio transaccional es la fuente de verdad para acuerdos, pagos, suscripciones y renovaciones.
- Los snapshots comerciales preservan el contexto histórico sin depender del catálogo vivo.
- Las mutaciones económicas son transaccionales, auditables y seguras frente a concurrencia.
- Los eventos críticos se persisten mediante Transactional Outbox antes de su entrega asíncrona.
- Las plataformas externas aportan tráfico y señales; la inteligencia del negocio vive dentro de SuperFlash Platform.
- La documentación, los ADRs y el código deben evolucionar de forma trazable y compatible.

## Lenguaje ubicuo

| Término              | Definición                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| Organization         | Tenant que agrupa usuarios, configuración y datos de negocio.                       |
| Contact              | Persona o lead perteneciente a una organización.                                    |
| Opportunity          | Posible acuerdo comercial dentro del pipeline.                                      |
| Sale                 | Acuerdo comercial confirmado o en proceso de confirmación.                          |
| Payment              | Movimiento financiero asociado a una venta.                                         |
| Subscription         | Ciclo recurrente originado por un SaleItem elegible.                                |
| Renewal              | Identidad histórica de un periodo de renovación.                                    |
| Snapshot             | Representación inmutable del catálogo y pricing aplicado en un momento comercial.   |
| Transactional Outbox | Registro durable de un evento creado en la misma transacción del cambio de dominio. |
| Revenue Intelligence | Capa de lectura para métricas, embudos, cohortes, tendencias y forecast comercial.  |

## Mapa de dominios

### Identity and organization

Identity, Organizations y Permissions gobiernan usuarios, roles, permisos,
sesiones y aislamiento multiempresa.

### CRM execution

Contacts, Opportunities, Pipeline, Follow-ups, Agenda y My Day gestionan la
relación comercial, el trabajo operativo y el seguimiento de leads.

### Commercial Core

Catalog, Pricing, Sales, Payments, Subscriptions y Renewals representan el
acuerdo, el dinero y los ciclos comerciales. Audit and Activity proporcionan
trazabilidad; Transactional Outbox entrega eventos durables a consumidores
asíncronos.

### Communications and Automations

Communications and Automations consume eventos del Transactional Outbox y
transforman triggers en acciones internas idempotentes. Templates, reglas,
ejecuciones, historial de acciones y notificaciones permanecen dentro del
tenant y no introducen dependencias con proveedores externos. El motor usa una
cola durable respaldada por PostgreSQL, reintentos con backoff y `requestId`
end-to-end.

### Evolución y roadmap futuro

Operations and Fulfillment está implementado como Architecture v1.1 y pendiente
de revisión formal. Communications and Automations está implementado como
Architecture v1.2 y pendiente de revisión formal. Analytics and Reporting avanzado e integraciones permanecen fuera de la implementación actual. Revenue Intelligence Phase 1 está implementado como una capa de lectura. El detalle de Revenue Intelligence está en
[docs/roadmap/revenue-intelligence.md](../roadmap/revenue-intelligence.md).

### Frontend Foundation

La interfaz profesional de Architecture v1.0/v1.1 se implementa como una capa
de consumo: no crea dominios, endpoints ni reglas de negocio. El App Router
organiza el workspace por features y consume los contratos existentes de CRM,
Commercial Core y Operations and Fulfillment. La documentación de UX, diseño y
navegación está en [docs/frontend.md](../frontend.md),
[docs/design-system.md](../design-system.md) y
[docs/navigation.md](../navigation.md).

## Reglas de versionado

- Una versión de arquitectura se identifica como `vMAJOR.MINOR`.
- `MAJOR` implica un cambio de límites, principios o contratos que requiere una nueva aprobación formal.
- `MINOR` agrega capacidades compatibles dentro de los límites aprobados.
- Una versión `FROZEN` no recibe cambios funcionales; solo puede recibir correcciones documentales que no alteren sus decisiones.
- Toda decisión que modifique límites, contratos o invariantes debe tener un ADR numerado.
- Un roadmap no equivale a una capacidad implementada: debe permanecer marcado como `PLANNED` o `ROADMAP / NOT IMPLEMENTED`.
- El informe de revisión conserva sus hallazgos originales; las remediaciones y cierres se agregan como evidencia posterior.

## Definition of Architecture Done

Una versión arquitectónica solo puede aprobarse cuando:

1. sus límites y dominios están documentados;
2. sus invariantes y contratos tienen una decisión trazable;
3. las migraciones, pruebas y CI correspondientes están verdes;
4. el aislamiento multiempresa y la observabilidad requerida están definidos;
5. los riesgos residuales están registrados como follow-ups no bloqueantes o bloqueantes;
6. existe un commit de aprobación reproducible;
7. las capacidades futuras permanecen fuera del código y del schema hasta su propia aprobación.

## Versiones de arquitectura

| Versión           | Nombre                         | Estado                           | Alcance                                                                                  |
| ----------------- | ------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Architecture v1.0 | Commercial Core                | **APPROVED / FROZEN**            | Núcleo CRM, catálogo y ciclo comercial transaccional.                                    |
| Architecture v1.1 | Operations and Fulfillment     | **IMPLEMENTED / PENDING REVIEW** | Providers, fulfillment, provisioning, credentials, trials y activations.                 |
| Architecture v1.2 | Communications and Automations | **IMPLEMENTED / PENDING REVIEW** | Templates, variables, reglas, triggers, acciones, ejecuciones y notificaciones internas. |
| Architecture v1.3 | Analytics and Reporting        | **PLANNED**                      | Analítica y reporting; no iniciado.                                                      |
| Architecture v2.0 | Revenue Intelligence           | **IMPLEMENTED / PHASE 1**        | KPIs, embudos, cohortes, tendencias, forecast básico y dashboard ejecutivo de lectura.   |

### Architecture v1.0 — Commercial Core

Estado: **APPROVED / FROZEN**
Commit de aprobación: `d4ee72096edb6d691675a8a518a6ee3aeb610a18`
Veredicto: **APPROVED WITH FOLLOW-UP**

Dominios incluidos:

- Identity
- Organizations
- Permissions
- Contacts
- Opportunities
- Pipeline
- Follow-ups
- Agenda
- My Day
- Catalog
- Pricing
- Sales
- Payments
- Subscriptions
- Renewals
- Transactional Outbox
- Audit and Activity

Follow-ups no bloqueantes:

- actualizar en el futuro las GitHub Actions por la deprecación del runtime Node.js 20;
- incorporar observabilidad operacional del dispatcher Outbox;
- ampliar progresivamente las pruebas de migración legacy y concurrencia.

Architecture v1.1 está implementada en el código, pero permanece **PENDING REVIEW** hasta su aprobación arquitectónica formal.

### Architecture v2.0 — Revenue Intelligence Phase 1

Estado: **IMPLEMENTED / PHASE 1**

La primera fase agrega `apps/api/src/modules/revenue-intelligence` y una capa
analítica de solo lectura. Las materialized views se crean en una migración
nueva y no se registran como modelos de negocio en Prisma. No se implementan
atribución externa, MarketingSpend, IA, conversión de monedas ni Analytical
Event Store.

## Índice de ADRs

- [ADR-006 — Sales Snapshot](../ADR-006-sales-snapshot.md)
- [ADR-007 — Calculated Balance](../ADR-007-calculated-balance.md)
- [ADR-008 — Subscription Lifecycle](../ADR-008-subscription-lifecycle.md)
- [ADR-009 — Renewal Engine](../ADR-009-renewal-engine.md)
- [ADR-010 — Transactional Outbox](../ADR-010-transactional-outbox.md)
- [ADR-011 — Commercial Snapshot Contract](../ADR-011-commercial-snapshot-contract.md)
- [ADR-012 — Renewal Cycle Identity](../ADR-012-renewal-cycle-identity.md)
- [ADR-013 — Commercial Cancellation Policy](../ADR-013-commercial-cancellation-policy.md)
- [ADR-014 — Request Correlation](../ADR-014-request-correlation.md)
- [ADR-015 — Architecture Versioning](../ADR-015-architecture-versioning.md)
- [ADR-016 — Revenue Intelligence Boundary](../ADR-016-revenue-intelligence-boundary.md)
- [ADR-017 — External Platforms as Traffic Sources](../ADR-017-external-platforms-as-traffic-sources.md)
- [ADR-018 — Analytical Event Store Roadmap](../ADR-018-analytical-event-store-roadmap.md)
- [ADR-019 — Provider Adapter Boundary](../ADR-019-provider-adapter-boundary.md)
- [ADR-020 — Fulfillment Identity](../ADR-020-fulfillment-identity.md)
- [ADR-021 — Credential Security](../ADR-021-credential-security.md)
- [ADR-022 — Trial Lifecycle](../ADR-022-trial-lifecycle.md)
- [ADR-023 — Activation Model](../ADR-023-activation-model.md)

Las definiciones de la fase están documentadas en [revenue-intelligence.md](../revenue-intelligence.md), [kpis.md](../kpis.md) y [funnels.md](../funnels.md).

## Historial de decisiones

| Hito                          | Evidencia                                         | Resultado                                                                 |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Bootstrap y dominios CRM      | Historial de commits de los Sprints 1–7.1         | Base multiempresa y Feature First.                                        |
| Commercial Core               | `9bcada0928c440b022863359e2156439883aebaf`        | Sales, Payments, Subscriptions y Renewals implementados.                  |
| CI Recovery                   | `16503b9720a6033efb5ce9b64ce80395ab76168a`        | CI recuperado y verificado.                                               |
| Architecture Review v1.0      | `4bc0658942172f967a11b2e52f0bec338a7ee034`        | Hallazgos HIGH/MEDIUM documentados.                                       |
| Architecture v1.0 Remediation | `d4ee72096edb6d691675a8a518a6ee3aeb610a18`        | Hallazgos remediados; Commercial Core aprobado con follow-ups.            |
| Governance update             | Este cambio documental                            | v1.0 congelada y roadmap Revenue Intelligence registrado.                 |
| Architecture v1.1 Operations  | `feat: implement operations and fulfillment core` | Implementación operativa pendiente de revisión formal.                    |
| Architecture v2.0 Phase 1     | `feat: implement revenue intelligence phase 1`    | KPIs, lectura analítica, funnels, cohortes, tendencias y forecast básico. |
