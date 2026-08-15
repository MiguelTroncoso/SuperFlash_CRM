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
v2.0 — Revenue Intelligence está **IMPLEMENTED / PHASE 1** para KPIs, funnels,
cohortes, tendencias, forecast básico y dashboard ejecutivo de solo lectura.
Las integraciones externas, atribución avanzada, IA y Analytical Event Store
siguen en roadmap en [docs/roadmap/revenue-intelligence.md](docs/roadmap/revenue-intelligence.md).

Architecture v2.2 — Communication Layer está **IMPLEMENTED**. La capa abstrae
providers de comunicación, deja WhatsApp preparado con webhook HMAC, health,
métricas y eventos internos, y permanece deshabilitada si faltan variables
críticas. La configuración y el checklist de go-live están en
[docs/communication-architecture.md](docs/communication-architecture.md),
[docs/whatsapp-provider.md](docs/whatsapp-provider.md) y
[docs/whatsapp-go-live-checklist.md](docs/whatsapp-go-live-checklist.md).
No se conectan números oficiales ni se envían mensajes reales en este sprint.

Architecture v2.3 — WhatsApp Read Only está **IMPLEMENTED**. El conector lee el
read model local, mantiene un checkpoint por organización y alimenta Smart
Inbox y Revenue Intelligence. No tiene operaciones de envío, edición,
eliminación, marcado o archivado de conversaciones; el operador continúa
trabajando en WhatsApp Business. Consulta [docs/whatsapp-readonly.md](docs/whatsapp-readonly.md),
[docs/synchronization.md](docs/synchronization.md) y
[docs/read-only-architecture.md](docs/read-only-architecture.md).

La implementación v1.1 agrega exclusivamente la capa operativa posterior a la
venta. La integración oficial de WhatsApp Cloud API se mantiene como boundary
externo aislado y no agrega bots ni automatizaciones externas.

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

## Producción

La base para el VPS está separada en `docker-compose.prod.yml`. No reemplaza
el compose de desarrollo y no incluye Mailpit, Adminer, bind mounts del código
ni puertos públicos para PostgreSQL o Redis.

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# editar .env.production con secretos únicos de producción
./scripts/production/deploy.sh
```

En producción, Web queda en `127.0.0.1:3000`, API en `127.0.0.1:3001` y los
servicios de datos solo en la red interna Docker. Nginx y Certbot se gestionan
en el VPS usando las referencias de `deploy/nginx/`. La operación completa está
documentada en [docs/production-deployment.md](docs/production-deployment.md),
con procedimientos de backup en [docs/backup-restore.md](docs/backup-restore.md)
y rollback en [docs/rollback.md](docs/rollback.md).

## Desarrollo local

Con PostgreSQL y Redis disponibles localmente:

```bash
npm run dev:web
npm run dev:api
```

Los comandos se ejecutan en terminales separadas.

## Revenue Intelligence

El dashboard ejecutivo está disponible en `/` y `/revenue`. Sus vistas de KPIs,
funnels, cohortes, tendencias y forecast están bajo `/revenue/*` y requieren el
permiso `reports.read`. La capa analítica nunca acepta `organizationId` desde el
cliente, no modifica el núcleo transaccional y agrupa los resultados por
moneda.

Para refrescar los agregados PostgreSQL cuando se ejecute un scheduler operativo:

```bash
npm run db:refresh-revenue-views
```

Consulta [docs/revenue-intelligence.md](docs/revenue-intelligence.md),
[docs/kpis.md](docs/kpis.md) y [docs/funnels.md](docs/funnels.md) para las
definiciones, filtros y limitaciones de Phase 1.

Las métricas de comunicación entrante están disponibles en
`GET /api/v1/revenue-intelligence/communication` y dentro del dashboard
ejecutivo. Son consultas de lectura: no mueven pipeline ni crean acciones
comerciales.

## Operación comercial diaria

La interfaz principal está organizada alrededor del flujo
`Registrar Lead → Demo → Seguimiento → Cobro → Activación → Renovación`.
El menú diario contiene Dashboard, Mi Día, Leads, Pipeline, Ventas, Cobros,
Renovaciones, Catálogo y Configuración. Las herramientas avanzadas permanecen
disponibles desde Configuración sin modificar sus APIs ni reglas de negocio.
Consulta [docs/operational-reset.md](docs/operational-reset.md).

Sprint 35 consolida el dashboard operativo en `/` y `/operations`. Permite
registrar actividad diaria por campaña y país, importar históricos idempotentes,
consultar conversaciones, demos, seguimientos, cobros, renovaciones y stock
crítico, y separar explícitamente las ventas informativas de la fuente
financiera real (`Sale` + `Payment`). La guía está en
[docs/operational-workflow.md](docs/operational-workflow.md).

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

## Marketing y atribución comercial

Architecture v2.9 agrega `/marketing` para campañas, gasto publicitario,
atribución, estados conversacionales, motivos, importaciones y rendimiento.
Las rutas requieren permisos `marketing.*`; la utilidad solo se incluye cuando
el usuario tiene `commercial.profit.read`. Campaign y Expense siguen siendo las
entidades canónicas, por lo que Revenue Intelligence y Financial Intelligence
no reciben ingresos duplicados.

Documentación operativa: [campañas](docs/marketing-campaigns.md),
[atribución](docs/commercial-attribution.md), [gasto](docs/marketing-spend.md),
[rendimiento](docs/campaign-performance.md) e
[importaciones](docs/commercial-imports.md).

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

La remediación de UX agrega el catálogo compartido de países para contactos y
WhatsApp, filtros de contactos sin recarga, modo claro/oscuro/sistema, menú de
usuario y perfil básico, además de operaciones de catálogo para productos,
categorías, planes, price books, precios y stock. Providers y Fulfillment
exponen operaciones válidas del backend; Fulfillment no se crea manualmente.
La tienda pública, carrito, checkout y compras públicas permanecen únicamente
en [docs/public-commerce-roadmap.md](docs/public-commerce-roadmap.md).

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

## WhatsApp Cloud API y Read Only

La infraestructura Cloud API conserva el webhook firmado y el read model
inbound. La bandeja actual se presenta como Read Only: lee conversaciones y
mensajes, crea contactos nuevos cuando corresponde y actualiza únicamente
actividad derivada. No crea oportunidades automáticamente ni modifica el
canal externo.
Los endpoints autenticados están bajo `/api/v1/integrations/whatsapp`; el
webhook público es únicamente `GET/POST
/api/v1/integrations/whatsapp/webhook`. El conector Read Only expone estado,
sincronización y reindexación bajo
`/api/v1/communication/channels/whatsapp-read-only`. Sus permisos son
`whatsapp.read`, `whatsapp.manage` y `reports.read` para el conector Read Only.

Configura `WHATSAPP_GRAPH_API_VERSION` y
`WHATSAPP_WEBHOOK_PUBLIC_URL` en el entorno. WABA ID, Phone Number ID, Access
Token, App Secret y Verify Token se guardan por organización cifrados en la
base de datos; nunca se devuelven completos ni se escriben en logs. Consulta
[docs/whatsapp-production-setup.md](docs/whatsapp-production-setup.md),
[docs/whatsapp-webhook.md](docs/whatsapp-webhook.md) y
[docs/whatsapp-troubleshooting.md](docs/whatsapp-troubleshooting.md).

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

## WhatsApp Web QR Read Only

Architecture v2.4 agrega un servicio privado `whatsapp-reader` basado en Baileys. No usa Meta Cloud API,
no envía mensajes y no importa historial. Para producción, configura las variables `WHATSAPP_READER_*`,
levanta el servicio y ejecuta `./scripts/production/pair-whatsapp-reader.sh`; el comando permanece esperando
el escaneo del QR. La documentación está en [docs/whatsapp-web-qr-readonly.md](docs/whatsapp-web-qr-readonly.md).

## Financial Intelligence Phase 1

El módulo `financial/` ofrece dashboard, gastos, categorías y gastos recurrentes idempotentes. Requiere
`financial.read` para lectura y `financial.manage` para mutaciones. Los detalles están en
[docs/financial-intelligence.md](docs/financial-intelligence.md), [docs/expenses.md](docs/expenses.md) y
[docs/recurring-expenses.md](docs/recurring-expenses.md).

## Renewal Intelligence & Customer Lifecycle

Architecture v2.6 incorpora el Centro de Renovaciones con dashboard, listas rápidas, calendario,
workflow operativo, recordatorios internos, reportes, exportación e importación CSV con vista previa.
El pago manual crea la siguiente renovación de forma transaccional e idempotente y los dashboards
existentes de Revenue y Financial la reflejan desde sus fuentes persistidas.

Permisos: `renewals.read`, `renewals.create`, `renewals.update`, `renewals.delete` y `renewals.export`.
La documentación está en [docs/renewal-center.md](docs/renewal-center.md),
[docs/customer-lifecycle.md](docs/customer-lifecycle.md), [docs/renewal-dashboard.md](docs/renewal-dashboard.md)
y [docs/renewal-import.md](docs/renewal-import.md).

El sprint no envía WhatsApp, no ejecuta respuestas automáticas, no usa IA y no modifica automáticamente
el Pipeline.

## Sprint 28 · Executive Intelligence & CRM Maturity

El Dashboard ejecutivo (`/`) y Business Intelligence consumen métricas reales del núcleo comercial sin duplicar lógica transaccional. También están disponibles Customer 360 (`/customers/:id`), Agenda Operativa (`/agenda`), Pipeline Intelligence (`/pipeline/intelligence`) y búsqueda global mediante `Ctrl/⌘ K`.

La API agrega las rutas read-side `/api/v1/executive/dashboard`, `/api/v1/business-intelligence/:view`, `/api/v1/customer-360/:contactId`, `/api/v1/global-search`, `/api/v1/agenda/operational` y `/api/v1/pipeline/intelligence`. Requieren los permisos existentes `reports.read`, `contacts.read`, `followups.read` u `opportunities.read`.

La única migración nueva de este sprint agrega `Opportunity.probability` y `Opportunity.priority` con validación PostgreSQL. No se modificaron migraciones anteriores. Detalles en [docs/executive-dashboard.md](docs/executive-dashboard.md), [docs/business-intelligence.md](docs/business-intelligence.md), [docs/customer-360.md](docs/customer-360.md), [docs/operational-agenda.md](docs/operational-agenda.md), [docs/pipeline-intelligence.md](docs/pipeline-intelligence.md) y [docs/crm-v1-readiness.md](docs/crm-v1-readiness.md).
