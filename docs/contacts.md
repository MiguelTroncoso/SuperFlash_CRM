# Contactos y lead intake

El módulo de contactos vive en `apps/api/src/modules/contacts` y expone únicamente el alcance del Sprint 4 bajo `/api/v1/contacts` y `/api/v1/tags`. Todas las rutas requieren un access token Bearer y permisos efectivos cargados desde la sesión autenticada.

## Crear un lead

```http
POST /api/v1/contacts
Authorization: Bearer <access-token>
Content-Type: application/json
```

El body acepta nombre, correo, teléfono, país ISO alpha-2, fuente, notas, campaña, producto, responsable, etiquetas y `createOpportunity`. No acepta `organizationId`, estados internos, `phoneNormalized`, `deletedAt` ni datos de tenant.

Debe existir al menos un nombre, correo o teléfono. `createOpportunity` es `true` por defecto. Cuando está activo, la operación crea en una única transacción el contacto, la primera etapa activa y abierta del pipeline, las etiquetas, la Activity `SYSTEM` y el AuditLog. La etapa inicial nunca es recibida desde el cliente.

Los títulos iniciales son `Interés de <nombre>`, `Lead <teléfono E.164>` o `Nuevo lead`.

## Teléfonos y duplicados

Los teléfonos se normalizan con `libphonenumber-js`. Un número local usa `country` como país por defecto; un número con prefijo `+` se interpreta internacionalmente. El valor ingresado se conserva en `phone` y el valor canónico E.164 se guarda en `phoneNormalized`.

La aplicación busca duplicados dentro de la organización antes de crear o actualizar y la base de datos mantiene el índice único parcial para proteger carreras concurrentes. Un teléfono activo devuelve `CONTACT_PHONE_ALREADY_EXISTS`; uno archivado o eliminado devuelve `CONTACT_PHONE_ARCHIVED`. Los errores `P2002` de PostgreSQL se traducen al mismo contrato de dominio. Los correos iguales generan una advertencia, pero no bloquean la creación.

## Listado y detalle

```http
GET /api/v1/contacts?page=1&limit=25&search=juan&country=CL&archived=false
```

El listado admite búsqueda por nombre, correo y teléfono, filtros por país, fuente, responsable, etiqueta, campaña, producto, cliente y fechas. `limit` está limitado a 100 y `sortBy` solo puede ser `createdAt`, `updatedAt`, `lastActivityAt`, `firstName` o `country`.

El detalle devuelve las oportunidades no eliminadas, las últimas 20 actividades, próximos seguimientos acotados y un resumen de ventas. Un contacto de otra organización se comporta como `404 CONTACT_NOT_FOUND`.

## Asignación y política de acceso

`PATCH /api/v1/contacts/:id/assignee` recibe un UUID o `null`. El responsable debe pertenecer al tenant, estar activo y tener un rol no eliminado. Al asignar se actualizan solo las oportunidades abiertas que no tenían responsable; al desasignar solo se limpian las oportunidades que conservaban el responsable anterior.

Owner y Admin pueden modificar cualquier contacto del tenant. Sales puede modificar contactos sin responsable o asignados a sí mismo. Viewer solo puede leer. Esta regla vive en `ContactAccessPolicy` y no depende del cliente.

## Archivado y etiquetas

Archivar establece `archivedAt`, conserva oportunidades, ventas y actividades, y registra Activity y auditoría. Restaurar vuelve a comprobar la unicidad del teléfono. Ambas operaciones son idempotentes y nunca eliminan físicamente el contacto.

Las etiquetas son únicas por organización, validan colores `#RRGGBB` y se archivan con `deletedAt`. Las asociaciones `ContactTag` también son soft delete: agregar una asociación existente no duplica filas y puede restaurar una asociación eliminada.

## Auditoría y aislamiento

Las mutaciones registran `CONTACT_CREATED`, `CONTACT_UPDATED`, `CONTACT_ARCHIVED`, `CONTACT_RESTORED`, `CONTACT_ASSIGNEE_CHANGED`, `CONTACT_TAG_ADDED`, `CONTACT_TAG_REMOVED` y eventos equivalentes de etiquetas. La auditoría conserva organización, usuario, tabla, registro, cambios e IP, sin credenciales ni tokens.

El tenant siempre proviene de `AuthenticatedUser.organizationId`. Las consultas Prisma filtran por organización y las relaciones sensibles usan claves compuestas. Nunca se acepta `organizationId` desde body, query o params.

## Pruebas

Las pruebas unitarias cubren normalización, identidad, títulos y política de vendedor. Las pruebas HTTP de contactos usan el esquema PostgreSQL aislado `auth_test` y cubren duplicados concurrentes, tenants, campañas, productos, paginación, búsqueda, asignación, tags, archivado, permisos y auditoría:

```bash
DATABASE_URL='postgresql://superflash:superflash@localhost:5432/superflash?schema=auth_test' \
NODE_ENV=test COOKIE_SECURE=false SWAGGER_ENABLED=false \
JWT_ACCESS_SECRET='ci-only-auth-test-secret-change-me-1234567890' \
npm run test:integration
```
