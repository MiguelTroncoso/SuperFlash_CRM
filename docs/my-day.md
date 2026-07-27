# Backend “Mi Día”

El backend para la futura pantalla principal está en `/api/v1/my-day` y requiere `followups.read`. No implementa frontend, calendario visual, recordatorios, notificaciones ni llamadas externas.

`GET /api/v1/my-day` acepta `timezone`, `assignedUserId` y `limitPerSection` (20 por defecto, máximo 50). Para Sales, `assignedUserId` se ignora y se fuerza el usuario autenticado. Owner/Admin pueden consultar todo el tenant o filtrar por responsable.

La respuesta contiene ocho secciones con `{ data, total, hasMore }`:

1. `overdueFollowUps`: pendientes anteriores al inicio del día local, ordenados por prioridad descendente y fecha ascendente.
2. `todayFollowUps`: pendientes dentro del día local, por fecha ascendente y prioridad descendente.
3. `upcomingFollowUps`: pendientes desde mañana hasta los próximos siete días.
4. `newLeads`: oportunidades `OPEN` con `systemKey = NEW_LEAD` creadas en las últimas 72 horas.
5. `awaitingCreditUsage`: `systemKey = AWAITING_CREDIT_USAGE` y categoría `OPEN`.
6. `awaitingMoney`: `systemKey = AWAITING_MONEY` y categoría `OPEN`.
7. `potentialBuyers`: `systemKey = POTENTIAL_BUYER` y categoría `OPEN`.
8. `recentWins`: categoría `WON`, `wonAt` dentro de las últimas 48 horas.

Las secciones de oportunidades excluyen registros archivados/eliminados y respetan la política Sales directamente en PostgreSQL. No se identifican etapas por nombres visibles. Cada consulta aplica límite y devuelve el total real para permitir paginación futura sin cargar datos ilimitados.

`GET /api/v1/my-day/summary` devuelve únicamente conteos: vencidos, hoy, próximos, nuevos leads, créditos, dinero, posibles compradores, ganados recientes y pendientes urgentes. Usa agregaciones independientes y no cuenta los arrays del endpoint completo.
