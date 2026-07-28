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

## Rendimiento y UX

El App Router separa rutas y permite code splitting por página. React Query
prefetcha y conserva respuestas recientes; TanStack Table resuelve el modelo de
tablas; dnd-kit resuelve el movimiento del Kanban; Recharts se carga dentro del
Dashboard. Las vistas tienen skeleton, empty state y error state. Los drawers
mantienen edición contextual sin abandonar el workspace.

## Desarrollo

```bash
npm run dev:web
npm run typecheck --workspace=@superflash/web
npm run test:web
npm run build:web
```

La variable `NEXT_PUBLIC_API_URL` apunta al host de la API, por defecto
`http://localhost:3001`.
