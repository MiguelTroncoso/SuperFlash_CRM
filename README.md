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
```

`db:migrate` aplica la migración inicial en desarrollo. Para despliegues con migraciones ya generadas, usar:

```bash
npm run db:migrate:deploy
```

El seed es idempotente y crea únicamente la Organización Demo, los roles `Owner`, `Admin`, `Sales`, `Viewer` y las etapas iniciales del pipeline. No crea usuarios ni contactos.

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

GitHub Actions instala dependencias, genera Prisma Client, ejecuta lint, typecheck y construye frontend y backend.

## Estado del Sprint 2

Este sprint contiene exclusivamente el modelo de datos, la migración inicial y el seed de referencia. No incluye login, CRUD, endpoints, servicios ni pantallas funcionales.
