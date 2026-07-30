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

El Header muestra contexto compacto, búsqueda, organización y menú de usuario.
El menú separa perfil, preferencias, organización, apariencia, seguridad y
logout confirmado. El perfil permite editar nombre, teléfono y zona horaria;
el correo queda readonly. El Sidebar puede colapsarse en escritorio y abrirse
como drawer en móvil; sus rutas se filtran por permisos y su estado se persiste
como preferencia visual.
