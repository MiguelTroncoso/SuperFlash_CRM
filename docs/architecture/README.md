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

| Término                | Definición                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Organization           | Tenant que agrupa usuarios, configuración y datos de negocio.                       |
| Contact                | Persona o lead perteneciente a una organización.                                    |
| Opportunity            | Posible acuerdo comercial dentro del pipeline.                                      |
| Sale                   | Acuerdo comercial confirmado o en proceso de confirmación.                          |
| Payment                | Movimiento financiero asociado a una venta.                                         |
| Subscription           | Ciclo recurrente originado por un SaleItem elegible.                                |
| Renewal                | Identidad histórica de un periodo de renovación.                                    |
| Snapshot               | Representación inmutable del catálogo y pricing aplicado en un momento comercial.   |
| Transactional Outbox   | Registro durable de un evento creado en la misma transacción del cambio de dominio. |
| Revenue Intelligence   | Capa de lectura para métricas, embudos, cohortes, tendencias y forecast comercial.  |
| Renewal Intelligence   | Capa operativa para administrar ciclos, riesgo, recuperación y lifecycle.           |
| Executive Intelligence | Capa read-side para dirección, BI, Customer 360, agenda y priorización comercial.   |

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

La integración WhatsApp Cloud API se implementa como un boundary externo de
comunicaciones: usa solo la API oficial de Meta, mantiene secretos cifrados por
organización, recibe eventos mediante webhook firmado y entrega mensajes por
Outbox durable. Esta integración no cambia el núcleo transaccional ni habilita
bots o automatizaciones externas.

Architecture v2.2 agrega la capa abstracta `communication`, con contratos
internos, health del canal, métricas y un provider WhatsApp aislado. El provider
se deshabilita de forma fail-open cuando faltan variables de entorno; no se
registran credenciales ni se realizan llamadas externas en el endpoint de
verificación local. Telegram, Instagram Direct y Messenger permanecen como
providers futuros.

Architecture v2.3 agrega `WhatsApp Read Only`: un provider que solo consulta
el read model local, un importador incremental con checkpoint y métricas de
actividad. La sincronización es tenant-aware, auditable y no ejecuta llamadas
externas. Smart Inbox permanece como workspace de observación y coordinación
manual; no se envían, editan, eliminan, marcan ni archivan mensajes desde
SuperFlash.

Architecture v2.4 agrega `WhatsApp Web Read Only`: un servicio `whatsapp-reader`
aislado basado en Baileys, pairing QR, sesión persistente y contrato interno
autenticado. El reader no accede a PostgreSQL ni tiene operaciones de escritura;
solo se aceptan mensajes nuevos después del inicio de ingesta.

Architecture v2.5 agrega `Financial Intelligence Phase 1` como módulo
independiente de gastos, categorías, recurrencias idempotentes y dashboard
financiero. Consume ventas existentes como lectura y no modifica Commercial
Core ni Revenue Intelligence.

Architecture v2.6 agrega `Renewal Intelligence` como módulo de operación manual
de renovaciones. Consume los ciclos y snapshots existentes, crea recordatorios
internos idempotentes y no ejecuta comunicaciones externas.

Architecture v2.7 agrega `Executive Intelligence & CRM Maturity` como capa
read-side sobre los datos transaccionales existentes. No crea un modelo
comercial paralelo ni modifica WhatsApp, Sales, Payments, Renewals o Fulfillment.

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

El canal de commerce público permanece fuera de las arquitecturas implementadas
y está registrado como roadmap no implementado en
[docs/public-commerce-roadmap.md](../public-commerce-roadmap.md).

### Operational Reset

Sprint 32 reorganiza exclusivamente la capa de experiencia para la operación
diaria. No agrega una versión arquitectónica, dominios, tablas ni reglas de
negocio. El frontend prioriza Registrar Lead, Pipeline, Ventas, Cobros,
Renovaciones y Catálogo; las capacidades avanzadas continúan accesibles desde
Configuración. La decisión y sus límites están documentados en
[docs/operational-reset.md](../operational-reset.md).

### Cierre operativo maestro

El flujo de uso diario queda definido como `Venta → Cliente automático → Cobro
→ Activación → Renovación → Historial`. La experiencia principal no expone un
módulo separado de Clientes ni Customer 360; la venta es la superficie de
consulta comercial. Los UUID permanecen como identificadores técnicos, pero no
se muestran en la UI. Las comisiones de pago se calculan mediante una
configuración por organización y el ingreso real considera netos confirmados y
reembolsos.

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

| Versión           | Nombre                                              | Estado                               | Alcance                                                                                           |
| ----------------- | --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Architecture v1.0 | Commercial Core                                     | **APPROVED / FROZEN**                | Núcleo CRM, catálogo y ciclo comercial transaccional.                                             |
| Architecture v1.1 | Operations and Fulfillment                          | **IMPLEMENTED / PENDING REVIEW**     | Providers, fulfillment, provisioning, credentials, trials y activations.                          |
| Architecture v1.2 | Communications and Automations                      | **IMPLEMENTED / PENDING REVIEW**     | Templates, variables, reglas, triggers, acciones, ejecuciones y notificaciones internas.          |
| Architecture v1.3 | Analytics and Reporting                             | **PLANNED**                          | Analítica y reporting; no iniciado.                                                               |
| Architecture v2.0 | Revenue Intelligence                                | **IMPLEMENTED / PHASE 1**            | KPIs, embudos, cohortes, tendencias, forecast básico y dashboard ejecutivo de lectura.            |
| Architecture v2.1 | Operational Workspace                               | **IMPLEMENTED / PENDING REVIEW**     | Smart Inbox, timeline operacional, acciones contextuales y preparación realtime.                  |
| Architecture v2.2 | Communication Layer                                 | **IMPLEMENTED**                      | Contratos de canales, provider WhatsApp foundation, webhook firmado, health y métricas.           |
| Architecture v2.3 | WhatsApp Read Only                                  | **IMPLEMENTED**                      | Read model local, sincronización incremental, checkpoint, health, Smart Inbox y métricas.         |
| Architecture v2.4 | WhatsApp Web Read Only                              | **IMPLEMENTED / PENDING PRODUCTION** | Pairing QR, sesión persistente, reader Baileys y sincronización inbound nueva.                    |
| Architecture v2.5 | Financial Intelligence Phase 1                      | **IMPLEMENTED**                      | Gastos, categorías, recurrencias idempotentes y dashboard financiero.                             |
| Architecture v2.6 | Renewal Intelligence                                | **IMPLEMENTED**                      | Centro de Renovaciones, lifecycle, recordatorios, CSV, reportes y calendario.                     |
| Architecture v2.7 | Executive Intelligence                              | **IMPLEMENTED / PENDING REVIEW**     | Dashboard ejecutivo, BI, Customer 360, agenda, pipeline avanzado y búsqueda global.               |
| Architecture v2.9 | Commercial Attribution, Performance & Profitability | **IMPLEMENTED / PENDING REVIEW**     | Campañas, atribución, gasto, estados conversacionales, SLA, rentabilidad e importaciones seguras. |

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

### Architecture v2.1 — Operational Workspace

Estado: **IMPLEMENTED / PENDING REVIEW**

El Operational Workspace transforma la vista principal de WhatsApp en un Smart
Inbox tenant-aware. Reutiliza los servicios existentes de conversaciones,
pipeline, ventas, seguimientos, fulfillment y trials; no crea un segundo motor
comercial ni modifica el contrato de la integración Cloud API. El backend
expone consultas paginadas, timeline unificada, acciones de CRM protegidas por
los permisos existentes y un stream SSE por organización. Desde v2.3 el
workspace observa el canal en modo Read Only: no muestra composer ni ejecuta
acciones de escritura sobre mensajes o conversaciones.

Meta Business, WABA, webhooks reales, tokens reales y migración de conversaciones
permanecen fuera del alcance y están reservados para Sprint 26.2.

### Architecture v2.2 — Communication Layer

Estado: **IMPLEMENTED**

La capa de comunicación queda preparada para WhatsApp Cloud API sin activar
credenciales, número oficial ni llamadas reales. Expone contratos internos,
endpoint webhook compatible, health por tenant, métricas seguras y traducción a
eventos del CRM. La conexión real está reservada para Sprint 26.2.

### Architecture v2.3 — WhatsApp Read Only

Estado: **IMPLEMENTED**

El conector de solo lectura consume los datos inbound persistidos localmente y
los mantiene disponibles para Smart Inbox y Revenue Intelligence. El
`CommunicationSyncCheckpoint` permite reanudar, reindexar y auditar
sincronizaciones por organización. Las rutas y servicios de escritura del
workspace están bloqueados con `WHATSAPP_READ_ONLY`; no se habilita envío,
respuesta automática, edición, eliminación, marcado ni archivado del canal.
Meta real, WABA, tokens reales y activación productiva quedan fuera del
alcance.

### Architecture v2.4 — WhatsApp Web Read Only

Estado: **IMPLEMENTED / PENDING PRODUCTION**

El servicio privado `whatsapp-reader` usa Baileys con sesión cifrada, pairing
QR y un contrato interno autenticado. No accede a PostgreSQL, no envía ni
modifica mensajes y acepta únicamente mensajes nuevos después del inicio de
ingesta. La conexión productiva y el pairing real requieren configuración
operacional explícita.

### Architecture v2.5 — Financial Intelligence Phase 1

Estado: **IMPLEMENTED**

El módulo `financial` gestiona categorías, gastos, recurrencias idempotentes y
un dashboard financiero de lectura. Consume ventas confirmadas y suscripciones
activas sin duplicar reglas de Commercial Core ni modificar Revenue Intelligence.
Los importes se analizan por moneda, sin conversión implícita.

### Architecture v2.6 — Renewal Intelligence

Estado: **IMPLEMENTED**

Renewal Intelligence añade el Centro de Renovaciones, gestión operativa de
ciclos, calendario, recordatorios internos idempotentes, importación histórica
con preview, reportes y lectura de ciclo de vida del cliente. Reutiliza el
Commercial Core y deja Revenue Intelligence y Financial Intelligence como
consumidores de los datos persistidos. No envía WhatsApp, no automatiza
respuestas, no usa IA y no modifica automáticamente el Pipeline.

### Architecture v2.7 — Executive Intelligence & CRM Maturity

Estado: **IMPLEMENTED / PENDING REVIEW**

Esta versión agrega el read-side ejecutivo sobre los dominios existentes:
Dashboard Ejecutivo, Business Intelligence por dimensiones, Customer 360,
Agenda Operativa, Pipeline Intelligence y búsqueda global. No crea dominios
transaccionales nuevos ni modifica las reglas de negocio. La única migración
nueva agrega probabilidad y prioridad a Opportunity con constraint de rango.
Las métricas se agrupan por moneda y cualquier indicador no soportado por datos
persistidos se devuelve como no disponible, sin inventar estimaciones.

### Architecture v2.9 — Commercial Attribution, Performance & Profitability

Estado: **IMPLEMENTED / PENDING REVIEW**

Esta versión agrega el módulo Feature First `marketing`. Reutiliza Campaign y
Expense como entidades canónicas, añade la jerarquía publicitaria, Attribution,
estado conversacional, motivos, configuración de cadencia e importaciones
auditables. Performance consume pagos confirmados, snapshots de SaleItem y
costos de Fulfillment sin duplicar Revenue Intelligence ni Financial
Intelligence. WhatsApp permanece sin activación y no se envían mensajes desde
estas reglas.

### Sprint 35 — Commercial Operating Workflow

El flujo operativo comercial se consolida sobre los dominios existentes sin
crear un dominio transaccional paralelo. `DailyMetric` registra actividad
manual e histórica por día, campaña y país; `Sale`, `Payment`, `Subscription` y
`Renewal` continúan siendo la única fuente financiera y de ciclo. La migración
de métricas es incremental y no modifica migraciones anteriores. Consulte
[operational-workflow.md](../operational-workflow.md).

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
- [ADR-024 — WhatsApp Web Read-Only Source](../ADR-024-whatsapp-web-readonly-source.md)
- [ADR-025 — Financial Intelligence Boundary](../ADR-025-financial-intelligence-boundary.md)
- [ADR-026 — Recurring Expense Identity](../ADR-026-recurring-expense-identity.md)

Sprint 28 no requiere ADR nuevo: las vistas read-side reutilizan las decisiones
del Commercial Core, Revenue Intelligence, Financial Intelligence y Renewal
Intelligence.

La arquitectura de canales y sincronización está documentada en
[WhatsApp Read Only](../whatsapp-readonly.md), [Synchronization](../synchronization.md)
y [Read-only architecture](../read-only-architecture.md).

Las definiciones de la fase están documentadas en [revenue-intelligence.md](../revenue-intelligence.md), [kpis.md](../kpis.md) y [funnels.md](../funnels.md).

## Historial de decisiones

| Hito                                     | Evidencia                                                           | Resultado                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Bootstrap y dominios CRM                 | Historial de commits de los Sprints 1–7.1                           | Base multiempresa y Feature First.                                                                              |
| Commercial Core                          | `9bcada0928c440b022863359e2156439883aebaf`                          | Sales, Payments, Subscriptions y Renewals implementados.                                                        |
| CI Recovery                              | `16503b9720a6033efb5ce9b64ce80395ab76168a`                          | CI recuperado y verificado.                                                                                     |
| Architecture Review v1.0                 | `4bc0658942172f967a11b2e52f0bec338a7ee034`                          | Hallazgos HIGH/MEDIUM documentados.                                                                             |
| Architecture v1.0 Remediation            | `d4ee72096edb6d691675a8a518a6ee3aeb610a18`                          | Hallazgos remediados; Commercial Core aprobado con follow-ups.                                                  |
| Governance update                        | Este cambio documental                                              | v1.0 congelada y roadmap Revenue Intelligence registrado.                                                       |
| Architecture v1.1 Operations             | `feat: implement operations and fulfillment core`                   | Implementación operativa pendiente de revisión formal.                                                          |
| Architecture v2.0 Phase 1                | `feat: implement revenue intelligence phase 1`                      | KPIs, lectura analítica, funnels, cohortes, tendencias y forecast básico.                                       |
| Architecture v2.1 Operational Workspace  | `feat: implement smart inbox operational workspace`                 | Smart Inbox operacional implementado; pendiente de revisión formal.                                             |
| Architecture v2.2 Communication Layer    | `feat: implement communication layer and whatsapp foundation`       | Foundation de canales y provider WhatsApp implementado; go-live pendiente.                                      |
| Architecture v2.3 WhatsApp Read Only     | `feat: implement whatsapp read-only synchronization`                | Read model, checkpoint, sincronización y métricas de lectura implementados.                                     |
| Architecture v2.4 WhatsApp Web Read Only | `feat: connect whatsapp web qr read-only source`                    | Reader QR privado, sesión cifrada y mensajes inbound nuevos.                                                    |
| Architecture v2.5 Financial Intelligence | `feat: implement financial intelligence phase 1`                    | Gastos, categorías, recurrencias y dashboard financiero implementados.                                          |
| Architecture v2.6 Renewal Intelligence   | `feat: implement renewal intelligence and customer lifecycle`       | Centro de Renovaciones, ciclo de vida, recordatorios, CSV y reportes.                                           |
| Architecture v2.7 Executive Intelligence | `feat: implement executive intelligence and CRM maturity`           | Dashboard, BI, Customer 360, agenda, pipeline avanzado y búsqueda global.                                       |
| Architecture v2.9 Commercial Attribution | `feat: implement commercial attribution and campaign profitability` | Campañas, atribución, gasto, estados, rentabilidad e importaciones implementados; pendiente de revisión formal. |
