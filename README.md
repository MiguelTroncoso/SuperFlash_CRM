# SuperFlash CRM

Bootstrap profesional del monorepo para SuperFlash CRM. La base queda preparada para evolucionar hacia un SaaS multiempresa, con separación por aplicaciones, paquetes compartidos e infraestructura aislada.

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

Un solo comando levanta PostgreSQL, Redis, Mailpit, Adminer, la API y el frontend:

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
```

`db:migrate` aplica la migración inicial en desarrollo. Para despliegues con migraciones ya generadas, usar:

```bash
npm run db:migrate:deploy
```

El seed es idempotente y crea la Organización Demo, los roles `Owner`, `Admin`, `Sales`, `Viewer`, permisos base y las etapas iniciales del pipeline. Si se definen `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_OWNER_FIRST_NAME` y `SEED_OWNER_LAST_NAME`, también crea el Owner de desarrollo con password Argon2id. Sin esas variables, omite el usuario con un mensaje claro. No crea contactos.

`db:verify-integrity` crea fixtures temporales aislados, comprueba unicidad, claves foráneas multiempresa, ventas, snapshots y checks monetarios, y elimina los fixtures al terminar.

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

## Estado del Sprint 5.1

Este sprint contiene las correcciones de integridad de oportunidades y pipeline sobre el dominio del
Sprint 5. No incluye frontend CRM, ventas, pagos, CRUD completo de seguimientos, dashboard, WhatsApp,
Meta Ads, notificaciones ni importación CSV.
