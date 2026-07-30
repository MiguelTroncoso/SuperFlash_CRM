# Design System

SuperFlash usa una interfaz SaaS compacta, clara y orientada a operación. El
sistema visual vive en `apps/web/src/components/ui` y evita duplicar patrones
entre features.

## Tokens

- Brand: índigo `brand-600` para acciones primarias, enlaces y foco.
- Surfaces: `slate-50` para workspace, blanco para cards, `slate-950` para
  superficies oscuras.
- Radius: `rounded-xl` para controles y `rounded-2xl` para cards, drawers y
  contenedores principales.
- Type: jerarquía compacta con títulos bold, labels uppercase y texto de apoyo
  en `text-xs`.
- Estados: emerald para éxito/activo, amber para pendientes, blue para trabajo
  en curso, rose para errores y slate para archivado/revocado.

## Componentes

`Button`, `Card`, `DataTable`, `KanbanBoard`, `Drawer`, `Timeline`,
`ActivityFeed`, `MetricCard`, `StatusBadge`, `SearchBar`, `FilterBar`,
`Pagination`, `Skeleton`, `EmptyState`, `PermissionGate`, `ConfirmDialog`,
`ToastViewport` y `CommandPalette` son los bloques compartidos.

Cada componente mantiene accesibilidad básica: labels explícitos, roles para
diálogos, foco visible, botones reales y estados disabled durante mutaciones.

## Dark mode y responsive

El tema se controla desde Zustand como estado visual y aplica la clase `dark`
al documento. Soporta `light`, `dark` y `system`, persiste únicamente la
preferencia de apariencia y aplica el tema antes del primer render para evitar
flash. El layout tiene sidebar colapsable persistente en desktop, drawer móvil,
tooltips en modo compacto y tablas/kanban con scroll horizontal controlado.

## Regla de composición

Las features combinan componentes existentes. Si un patrón se repite, se
extrae a `components/ui` o `components/shared`; no se crean variantes locales
que desalineen la experiencia.
