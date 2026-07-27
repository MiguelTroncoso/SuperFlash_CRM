# Arquitectura inicial

## Monorepo

El repositorio usa npm workspaces para mantener frontend, backend y paquetes compartidos dentro de un único proyecto. Las aplicaciones son independientes en runtime, pero comparten configuración y contratos mediante `packages/`.

## Feature First

El backend agrupa cada bounded context bajo `apps/api/src/modules/`. Los módulos se registran en `AppModule` como puntos de extensión para los siguientes sprints. No se agregan controladores, servicios, entidades ni casos de uso hasta que exista una necesidad funcional explícita.

## Infraestructura

- PostgreSQL es la base de datos principal y Prisma es el único acceso ORM previsto.
- Redis queda disponible para cache y BullMQ.
- Mailpit ofrece SMTP y bandeja de correo local.
- Adminer permite inspección manual de PostgreSQL en desarrollo.
- Docker Compose orquesta todos los servicios locales.

## Frontend

Next.js usa App Router y un layout raíz compuesto por Sidebar, Header y contenido. Los elementos visuales están intencionalmente vacíos en este sprint. React Query queda inicializado en el provider raíz; Zustand, React Hook Form y Zod están instalados para las features futuras.

## Multiempresa

El dominio ya incorpora `Organization` como límite de tenant y `organizationId` en todas las entidades que pertenecen a una organización. Las relaciones y los índices de tenant quedan preparados para aplicar aislamiento en las capas futuras de aplicación.

Las reglas de acceso por organización todavía no se implementan: este sprint se limita al esquema, la migración y el seed de referencia.
