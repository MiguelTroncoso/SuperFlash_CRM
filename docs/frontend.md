# Frontend Foundation — Sprint 15–17

La web de SuperFlash está implementada con Next.js 15, React, TypeScript,
Tailwind CSS, App Router, React Query, React Hook Form y Zod. Consume
exclusivamente `/api/v1`; no replica reglas de negocio ni accede directamente a
Prisma.

## Arquitectura

El código está organizado Feature First:

```text
apps/web/src
├── app                  # rutas App Router y layouts
├── components
│   ├── layout            # Sidebar, Header y shell autenticado
│   ├── shared            # headers, estados de consulta y secciones
│   └── ui                # primitives y componentes reutilizables
├── features
│   ├── catalog
│   ├── contacts
│   ├── dashboard
│   ├── my-day
│   ├── operations        # providers, fulfillment, credentials, trials, activations
│   ├── pipeline
│   └── sales
└── lib                  # cliente HTTP, tipos, auth y estado visual
```

## Datos y seguridad

- React Query administra caché, refetch y estados de carga.
- El access token vive únicamente en memoria Zustand; nunca se escribe en
  `localStorage`.
- La cookie de refresh permanece HttpOnly en el backend.
- Cada solicitud incluye `credentials: include` y un `X-Request-ID`.
- Los permisos se aplican mediante `PermissionGate` y siguen siendo validados
  por `JwtAuthGuard` y `PermissionsGuard` en la API.
- Credenciales permanecen enmascaradas; la vista de reveal solo aparece con
  `credentials.reveal` y el backend audita la operación.
- El catálogo permite operar productos, categorías, planes, price books,
  entradas de precio y ajustes de stock; el costo sigue oculto por el permiso
  backend correspondiente.
- Contactos y WhatsApp comparten un catálogo de diez países para selector,
  prefijo y validación; el backend conserva la normalización E.164 y la
  unicidad del teléfono.

## Rendimiento y UX

El App Router separa rutas y permite code splitting por página. React Query
prefetcha y conserva respuestas recientes; TanStack Table resuelve el modelo de
tablas; dnd-kit resuelve el movimiento del Kanban; Recharts se carga dentro del
Dashboard. Las vistas tienen skeleton, empty state y error state. Los drawers
mantienen edición contextual sin abandonar el workspace.

La búsqueda general de contactos usa debounce; el filtro de país es un selector
independiente, conserva los query params y resetea la página sin recargar el
navegador. El tema soporta claro, oscuro y sistema, evita el flash inicial,
persiste la preferencia visual y responde a cambios del sistema.

Providers y Fulfillment consumen exclusivamente endpoints operativos
existentes. Fulfillment no ofrece creación manual: nace desde una venta y la
interfaz solo expone transiciones válidas, intentos y errores.

## Desarrollo

```bash
npm run dev:web
npm run typecheck --workspace=@superflash/web
npm run test:web
npm run build:web
```

La variable `NEXT_PUBLIC_API_URL` apunta al host de la API, por defecto
`http://localhost:3001`.
