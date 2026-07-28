# Navigation Map

La navegación principal está definida en
`apps/web/src/components/layout/sidebar.tsx` y se filtra por los permisos
efectivos del usuario autenticado.

| Área         | Ruta           | Permiso base         |
| ------------ | -------------- | -------------------- |
| Dashboard    | `/`            | contexto autenticado |
| Mi Día       | `/my-day`      | `followups.read`     |
| Contactos    | `/contacts`    | `contacts.read`      |
| Pipeline     | `/pipeline`    | `opportunities.read` |
| Ventas       | `/sales`       | `sales.read`         |
| Catálogo     | `/catalog`     | `catalog.read`       |
| Providers    | `/providers`   | `providers.read`     |
| Fulfillment  | `/fulfillment` | `fulfillments.read`  |
| Credenciales | `/credentials` | `credentials.read`   |
| Trials       | `/trials`      | `trials.read`        |
| Activaciones | `/activations` | `activations.read`   |

`CommandPalette` permite navegación rápida con `⌘K`/`Ctrl+K`. El `LayoutShell`
protege todas las rutas del workspace y redirige a `/login` si no existe una
sesión válida. El login no modifica el backend: consume `POST /auth/login`,
mantiene el access token en memoria y usa la cookie HttpOnly para renovar.

El Header muestra contexto de página, organización, modo oscuro y logout. El
Sidebar puede colapsarse en escritorio; en móvil el contenido conserva una
salida rápida al workspace y las vistas priorizan scroll horizontal para tablas
y Kanban.
