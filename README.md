# SuperFlash CRM

Bootstrap profesional del monorepo para SuperFlash CRM. La base queda preparada para evolucionar hacia un SaaS multiempresa, con separación por aplicaciones, paquetes compartidos e infraestructura aislada.

## Gobernanza de arquitectura

El [SuperFlash Platform Architecture Book](docs/architecture/README.md) es la
fuente oficial de verdad arquitectónica.

Architecture v1.0 — Commercial Core está **APPROVED / FROZEN** desde el commit
`d4ee72096edb6d691675a8a518a6ee3aeb610a18`, con veredicto **APPROVED WITH
FOLLOW-UP**. Sus follow-ups son no bloqueantes: actualización futura de GitHub
Actions por Node.js 20, observabilidad operacional del Outbox y ampliación
progresiva de pruebas legacy y de concurrencia.

Architecture v1.1 (Operations and Fulfillment) está **IMPLEMENTED / PENDING
REVIEW**. Architecture v1.2 (Communications and Automations) está
**IMPLEMENTED / PENDING REVIEW**. v1.3 (Analytics and Reporting) permanece
planificada. Architecture
v2.0 — Revenue Intelligence está en estado **ROADMAP / NOT IMPLEMENTED**; su
alcance se documenta en [docs/roadmap/revenue-intelligence.md](docs/roadmap/revenue-intelligence.md).

La implementación v1.1 agrega exclusivamente la capa operativa posterior a la
venta. No incluye integraciones externas reales, WhatsApp, automatizaciones,
Revenue Intelligence ni frontend CRM completo.

## Requisitos

- Node.js 22+
- npm 11+
- Docker y Docker Compose

## Instalación

```bash
npm install
cp .env.example .env
npm run db:generate
```

El archivo `.env` es local y no debe subirse al repositorio.

## Desarrollo con Docker

Un solo comando levanta PostgreSQL, Redis, Mailpit, Adminer, aplica las migraciones
pendientes y levanta la API y el frontend:

```bash
docker compose up -d
```

Servicios disponibles:

- Frontend: http://localhost:3000
- API: http://localhost:3001
- Adminer: http://localhost:8080
- Mailpit: http://localhost:8025

Las credenciales locales de PostgreSQL son `superflash` / `superflash`, con base de datos `superflash`.

Para detener los servicios:

```bash
docker compose down
```

## Desarrollo local

Con PostgreSQL y Redis disponibles localmente:

```bash
npm run dev:web
npm run dev:api
```

Los comandos se ejecutan en terminales separadas.

## Calidad y verificación

```bash
npm run lint
npm run typecheck
npm run build:web
npm run build:api
npm run format:check
```

Prisma contiene el dominio inicial del CRM y la conexión se valida al iniciar la API mediante `PrismaService`. La generación y validación del esquema se ejecutan con:

```bash
npm run db:generate
npm run db:validate
```

## Migraciones y seed

Con PostgreSQL disponible y `DATABASE_URL` configurado en `.env`:

```bash
npm run db:migrate
npm run db:seed
npm run db:verify-integrity
npm run prisma:verify-legacy --workspace=@superflash/api
```

`db:migrate` aplica la migración inicial en desarrollo. Para despliegues con migraciones ya generadas, usar:

```bash
npm run db:migrate:deploy
```

El seed es idempotente y crea la Organización Demo, los roles `Owner`, `Admin`, `Sales`, `Viewer`, permisos base y las etapas iniciales del pipeline. Si se definen `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_OWNER_FIRST_NAME` y `SEED_OWNER_LAST_NAME`, también crea el Owner de desarrollo con password Argon2id. Sin esas variables, omite el usuario con un mensaje claro. No crea contactos.

`db:verify-integrity` crea fixtures temporales aislados, comprueba unicidad, claves foráneas multiempresa, ventas, snapshots y checks monetarios, y elimina los fixtures al terminar.

## Operations and Fulfillment

Architecture v1.1 incorpora APIs backend Feature First para `providers`,
`provider-mappings`, `fulfillments`, `provisioning-attempts`, `credentials`,
`trials` y `activations`. Todas requieren JWT y permisos tenant-aware. Los
adaptadores disponibles son Manual y Mock; no realizan llamadas externas.

Los fulfillment se identifican por `saleItemId` y ciclo, se asignan bajo lock y
sus intentos de provisioning son append-only. Las credenciales se cifran con
AES-256-GCM, se enmascaran por defecto y solo se revelan con
`credentials.reveal`; nunca se incluyen secretos en logs, auditoría o Outbox.
El backend de [Mi Día](docs/fulfillment.md) agrega pendientes, fallidos,
activaciones, trials y reintentos operativos.

`prisma:verify-legacy` genera un diagnóstico de métodos que quedaron en `OTHER` y snapshots históricos incompletos. No inventa costos, precios ni atributos que no existían en los datos legacy.

El modelo aplica `deletedAt` para soft delete en las entidades del dominio. Las eliminaciones físicas de información crítica deben evitarse en las capas futuras de aplicación.

## Estructura

```text
.
├── apps
│   ├── api                 # NestJS, Prisma, Redis y BullMQ
│   └── web                 # Next.js App Router, Tailwind y shadcn/ui
├── packages
│   ├── config              # Configuración compartida
│   ├── types               # Tipos compartidos
│   ├── ui                  # Sistema UI compartido
│   └── utils               # Utilidades compartidas
├── docker                  # Dockerfiles de desarrollo
├── docs                    # Decisiones y documentación técnica
├── scripts                 # Automatizaciones del repositorio
└── .github/workflows       # Integración continua
```

El backend usa Feature First: cada módulo de negocio vive en `apps/api/src/modules/<feature>` y no se organizan carpetas globales de controllers, services o models.

## Frontend Foundation

Sprint 15–17 incorpora la primera experiencia profesional del workspace en
`apps/web`: Layout con Sidebar/Header colapsable, modo oscuro, responsive,
Command Palette, Dashboard, Mi Día, Contactos, Pipeline Kanban, Ventas,
Catálogo, Providers, Fulfillment, Credenciales, Trials y Activaciones.

La web consume exclusivamente la API existente. React Query gestiona caché y
estados remotos; React Hook Form/Zod validan formularios; TanStack Table y
dnd-kit resuelven tablas y Kanban; Recharts compone el gráfico del Dashboard.
Los tokens no se persisten en el navegador y las credenciales se mantienen
enmascaradas salvo reveal autorizado. Consulta [docs/frontend.md](docs/frontend.md),
[docs/design-system.md](docs/design-system.md) y [docs/navigation.md](docs/navigation.md).

Comandos frontend:

```bash
npm run dev:web
npm run test:web
npm run typecheck --workspace=@superflash/web
npm run build:web
```

## CI

GitHub Actions instala dependencias, genera Prisma Client, ejecuta migraciones públicas y aisladas, seed, verificación de integridad, pruebas unitarias e integración, Prettier, lint, typecheck y builds frontend/backend.

## Autenticación

La API expone la autenticación bajo `/api/v1/auth`:

- `POST /login` valida un usuario activo, entrega un access token JWT de 15 minutos y establece `superflash_refresh_token` como cookie HttpOnly.
- `POST /refresh` rota el refresh token opaco, conserva su `familyId` y detecta reutilización.
- `POST /logout` y `POST /logout-all` revocan sesiones.
- `GET /me` retorna el contexto efectivo del usuario autenticado.
- `POST /forgot-password` genera un token opaco con hash y respuesta anti-enumeración. En desarrollo se registra el token para pruebas locales; nunca se registra en producción.
- `POST /reset-password` consume el token una sola vez, actualiza la contraseña Argon2id y revoca sesiones.
- `GET /security-check` es un endpoint técnico protegido por `audit.read`.

Configura las variables de autenticación en `.env`. En producción `JWT_ACCESS_SECRET` debe existir, ser único y tener al menos 32 caracteres. Swagger está disponible en `/api/docs` cuando `SWAGGER_ENABLED=true`.

Para ejecutar las pruebas de integración sin tocar la base de desarrollo, usa un esquema aislado:

```bash
DATABASE_URL='postgresql://superflash:superflash@localhost:5432/superflash?schema=auth_test' npm run db:migrate:deploy
DATABASE_URL='postgresql://superflash:superflash@localhost:5432/superflash?schema=auth_test' NODE_ENV=test npm run test:integration
```

La explicación completa de sesiones, cookies, rotación, permisos y aislamiento multiempresa está en [docs/authentication.md](docs/authentication.md).

## Contactos y lead intake

El Sprint 4 incorpora el módulo de contactos y etiquetas, sin frontend CRM ni funcionalidades posteriores. La API expone:

- `POST /api/v1/contacts` para crear leads con validación estricta, normalización E.164, detección de duplicados y oportunidad inicial opcional.
- `GET /api/v1/contacts` y `GET /api/v1/contacts/:id` para listado, búsqueda, filtros, detalle y resumen acotado.
- `PATCH /api/v1/contacts/:id` para actualización parcial.
- `PATCH /api/v1/contacts/:id/assignee` para asignación multiempresa.
- `POST /api/v1/contacts/:id/archive` y `POST /api/v1/contacts/:id/restore` para archivado reversible.
- `POST` y `DELETE /api/v1/contacts/:id/tags/:tagId` para asociaciones soft delete.
- `GET`, `POST`, `PATCH`, `POST /archive` y `POST /restore` bajo `/api/v1/tags` para administrar etiquetas.

Los teléfonos usan `libphonenumber-js`; `phone` conserva la entrada visible y `phoneNormalized` almacena E.164. La documentación detallada está en [docs/contacts.md](docs/contacts.md). Las pruebas de integración de contactos se ejecutan junto con autenticación usando el esquema PostgreSQL aislado `auth_test`.

## Oportunidades y pipeline

El Sprint 5 incorpora el dominio de oportunidades y la gestión backend del pipeline, sin frontend CRM ni funcionalidades comerciales posteriores:

- `POST`, `GET`, `GET/:id` y `PATCH/:id` bajo `/api/v1/opportunities`.
- Asignación, movimiento, reapertura, archivado, restauración e historial de etapas.
- `GET /api/v1/pipeline`, `/summary` y columnas paginadas por cursor.
- Administración de etapas mediante `settings.manage`, con bloqueo transaccional por organización.

Las oportunidades mantienen `expectedAmount` como Decimal, derivan su estado desde la categoría de etapa y registran cada transición en `OpportunityStageHistory`. La documentación está en [docs/opportunities.md](docs/opportunities.md) y [docs/pipeline.md](docs/pipeline.md).

Las correcciones de Sprint 5.1 endurecen la integridad de las transiciones: la creación comienza
únicamente en etapas `OPEN`, respeta el estado y ownership del contacto, y aplica una prioridad
determinista para el responsable. La restauración valida el contacto dentro de la transacción y
actualiza `lastActivityAt` junto con Activity y AuditLog. El pipeline usa locks advisory con namespace
y organización, normaliza órdenes al restaurar y protege los conflictos concurrentes de archivado y
movimiento.

Para ejecutar las pruebas de integración del Sprint 5 usa el esquema aislado `auth_test`:

```bash
DATABASE_URL='postgresql://superflash:superflash@localhost:5432/superflash?schema=auth_test' \
NODE_ENV=test COOKIE_SECURE=false SWAGGER_ENABLED=false \
JWT_ACCESS_SECRET='ci-only-auth-test-secret-change-me-1234567890' \
npm run test:integration
```

## Integridad del dominio

- `Opportunity.expectedAmount` representa el valor comercial esperado; `Sale.subtotal` y `Sale.total` representan el cierre económico real.
- `SaleItem` conserva nombre, SKU, cantidad y precio históricos, aunque el producto cambie después.
- Las relaciones sensibles usan claves foráneas compuestas con `organizationId`.
- Teléfonos normalizados, SKU y ventas activas usan índices únicos parciales en PostgreSQL para respetar soft delete y valores `NULL`.
- `AuditLog` es append-only: no tiene `updatedAt` ni `deletedAt` y no debe actualizarse ni eliminarse desde la aplicación.

## Communications and Automation Engine

Architecture v1.2 agrega el motor interno de comunicaciones y automatizaciones
sin proveedores externos. Las APIs Feature First están disponibles bajo:

- `/api/v1/templates` para plantillas versionadas y vista previa segura;
- `/api/v1/automations` para reglas activas/inactivas y sus acciones;
- `/api/v1/automation-executions` para historial, intentos y errores;
- `/api/v1/notifications` para el centro interno por usuario.

Los eventos de dominio se consumen desde Transactional Outbox. Cada ejecución
se deduplica por organización, regla y `sourceEventId`, se procesa en una cola
durable PostgreSQL con `FOR UPDATE SKIP LOCKED`, conserva el estado por acción y
reintenta fallos con backoff. Los templates admiten variables seguras como
`{{contact.name}}`, `{{sale.total}}`, `{{subscription.nextBilling}}` y
`{{trial.endsAt}}`; valores ausentes se informan en la vista previa y no se
evalúan como código. No se implementan email, WhatsApp ni webhooks externos.

La guía completa está en [docs/automation-engine.md](docs/automation-engine.md),
[docs/templates.md](docs/templates.md) y [docs/notifications.md](docs/notifications.md).

## Seguimientos, agenda y Mi Día

El Sprint 6 agrega el backend comercial bajo estas rutas:

- `/api/v1/follow-ups`: crear, listar, consultar, editar, asignar, completar, cancelar, reprogramar, archivar, restaurar y consultar historial.
- `/api/v1/agenda` y `/api/v1/agenda/summary`: agenda diaria y resumen por día.
- `/api/v1/my-day` y `/api/v1/my-day/summary`: bandeja backend de ocho secciones y sus conteos.

Los seguimientos tienen estados `PENDING`, `COMPLETED`, `CANCELLED` y `RESCHEDULED`. Vencido es una propiedad calculada (`PENDING` y `dueAt < now`), nunca un estado persistido. La reprogramación conserva el registro original y crea un reemplazo enlazado mediante `rescheduledFromId`; su historial es append-only.

La unicidad activa se protege en aplicación y PostgreSQL por organización, oportunidad, responsable y fecha. Las transiciones usan `UPDATE ... WHERE status = PENDING` dentro de transacciones, de modo que completar, cancelar o reprogramar concurrentemente no duplica efectos.

La agenda recibe zonas IANA como `America/Santiago`, usa `DEFAULT_TIMEZONE` cuando no se informa y convierte el inicio/fin local a UTC con Luxon antes de consultar PostgreSQL. `limitPerSection` de Mi Día tiene un máximo de 50. Sales solo recibe los seguimientos y oportunidades permitidos por responsable; Owner/Admin ven toda su organización y Viewer conserva lectura según permisos.

Las ocho etapas oficiales tienen `systemKey` estable (`NEW_LEAD`, `LEFT_ON_READ`, `DEMO_DELIVERED`, `AWAITING_CREDIT_USAGE`, `AWAITING_MONEY`, `POTENTIAL_BUYER`, `WON`, `LOST`). Las etapas custom mantienen `systemKey = NULL`; los endpoints públicos de administración no permiten asignarlo.

Para validar este sprint en una base aislada:

```bash
DATABASE_URL='postgresql://superflash:superflash@localhost:5432/superflash?schema=auth_test' npm run db:migrate:deploy
DATABASE_URL='postgresql://superflash:superflash@localhost:5432/superflash?schema=auth_test' NODE_ENV=test COOKIE_SECURE=false SWAGGER_ENABLED=false JWT_ACCESS_SECRET='ci-only-auth-test-secret-change-me-1234567890' npm run test:integration
```

La documentación detallada está en [docs/follow-ups.md](docs/follow-ups.md), [docs/agenda.md](docs/agenda.md) y [docs/my-day.md](docs/my-day.md).

## Catálogo multiproducto y precios

El Sprint 7 incorpora el catálogo backend multiproducto sin frontend CRM, ventas, pagos ni suscripciones:

- Categorías, productos, planes y variantes bajo `/api/v1/catalog`.
- Price books, entradas de precio e historial append-only.
- Resolución vigente por segmento, país, moneda, default y prioridad con ranking lexicográfico estable.
- Ofertas activas agrupadas por producto con exactamente los mismos filtros temporales del resolvedor.
- Integridad multiempresa mediante claves compuestas, índices parciales y locks advisory.
- Productos `ACTIVE`, planes y variantes activos, price books/entradas vigentes y costos protegidos por
  `catalog.costs.read` (`includeCosts=true` sin permiso responde `403`).

La documentación está en [docs/catalog.md](docs/catalog.md), [docs/products.md](docs/products.md) y [docs/pricing.md](docs/pricing.md).
La vigencia usa `validFrom <= at` y `validUntil > at`; `validUntil` es exclusivo. Los defaults se
protegen por transacción, lock advisory por organización e índice único parcial; las entradas incluyen
sus límites de vigencia en la unicidad y usan `NULLS NOT DISTINCT`.
El seed no crea ejemplos por defecto; para datos de desarrollo usar `SEED_CATALOG_EXAMPLES=true npm run db:seed`.

La migración del catálogo se aplica junto con las anteriores:

```bash
npm run db:migrate:deploy
npm run db:generate
```

## Estado del Sprint 7.1

Este sprint endurece exclusivamente el catálogo multiproducto, planes, variantes, price books, resolución
de precios y ofertas backend. Aplica vigencia inclusiva/exclusiva, ranking lexicográfico, estados
comercializables, protección de costos, defaults concurrentes y duplicados por periodo. No incluye CRUD de
ventas/pagos, suscripciones, fulfillment, frontend CRM, checkout, cupones, impuestos avanzados,
proveedores externos ni automatizaciones posteriores.

## Estado del Sprint 6

Este sprint contiene seguimientos, historial, agenda y el backend de Mi Día sobre el dominio de
oportunidades. No incluye frontend CRM, productos CRUD, ventas, pagos, dashboard financiero, WhatsApp,
Meta Ads, notificaciones, recordatorios automáticos ni importación CSV.

## Núcleo comercial: Sales, Payments, Subscriptions y Renewals

El Macro Sprint 8–11 incorpora únicamente el núcleo comercial backend, sin fulfillment, providers,
IPTV, WhatsApp, automatizaciones, IA ni integraciones externas:

- `POST`, conversión desde oportunidad, listado, detalle y transiciones bajo `/api/v1/sales`.
- Pagos parciales, confirmación, fallos y reembolsos bajo `/api/v1/sales/:saleId/payments` y `/api/v1/payments`.
- Suscripciones creadas desde `SaleItem`, ciclos de cobro y transiciones bajo `/api/v1/subscriptions`.
- Renovaciones con estados, vencimiento y generación idempotente de una nueva venta bajo `/api/v1/renewals`.

Las ventas e ítems conservan snapshots comerciales versionados completos del catálogo. El saldo se calcula en servidor a partir
de pagos confirmados y reembolsos; no se persisten `remainingBalance` ni `paidAmount`. Las confirmaciones,
conversiones y pagos concurrentes usan locks de PostgreSQL y transacciones cortas. Una venta con pagos
confirmados netos no se cancela hasta completar los reembolsos. Cada operación relevante genera
`AuditLog`/`Activity` con `requestId` y los eventos se escriben en Transactional Outbox dentro del commit.

La remediación de Architecture v1.0 también agrega restricciones PostgreSQL de importes, fórmulas,
reembolsos, ciclos personalizados, orden de periodos y append-only para auditoría/actividad. El catálogo
comercializable se valida mediante el mismo resolvedor de pricing; overrides requieren permiso y motivo.

La documentación está en [docs/sales.md](docs/sales.md), [docs/payments.md](docs/payments.md),
[docs/subscriptions.md](docs/subscriptions.md), [docs/renewals.md](docs/renewals.md) y
[docs/domain-model.md](docs/domain-model.md). Las decisiones principales están en
[ADR-006](docs/ADR-006-sales-snapshot.md), [ADR-007](docs/ADR-007-calculated-balance.md),
[ADR-008](docs/ADR-008-subscription-lifecycle.md) y [ADR-009](docs/ADR-009-renewal-engine.md).
Las decisiones de endurecimiento están en [ADR-010](docs/ADR-010-transactional-outbox.md),
[ADR-011](docs/ADR-011-commercial-snapshot-contract.md), [ADR-012](docs/ADR-012-renewal-cycle-identity.md),
[ADR-013](docs/ADR-013-commercial-cancellation-policy.md) y [ADR-014](docs/ADR-014-request-correlation.md).
La gobernanza y el roadmap futuro están en [ADR-015](docs/ADR-015-architecture-versioning.md),
[ADR-016](docs/ADR-016-revenue-intelligence-boundary.md), [ADR-017](docs/ADR-017-external-platforms-as-traffic-sources.md)
y [ADR-018](docs/ADR-018-analytical-event-store-roadmap.md).

Para validar el núcleo comercial en un esquema PostgreSQL aislado:

```bash
DATABASE_URL='postgresql://superflash:superflash@localhost:5432/superflash?schema=auth_test' npm run db:migrate:deploy
DATABASE_URL='postgresql://superflash:superflash@localhost:5432/superflash?schema=auth_test' \
NODE_ENV=test COOKIE_SECURE=false SWAGGER_ENABLED=false \
JWT_ACCESS_SECRET='ci-only-auth-test-secret-change-me-1234567890' npm run test:integration
```

La suite acumulada supera 200 pruebas entre unitarias e integración. CI ejecuta migraciones, seed,
verificación de integridad, Prettier, tests, lint, typecheck y builds de API/Web.
