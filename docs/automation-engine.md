# Automation Engine

Architecture v1.2 introduce un motor interno para reaccionar a eventos
durables del CRM y ejecutar trabajo operativo dentro de la misma organización.
No hay proveedores externos en este alcance.

## Flujo

1. Un dominio confirma un cambio y persiste un `OutboxEvent` en la misma
   transacción.
2. El dispatcher publica el evento después del commit.
3. `AutomationProcessor` encuentra reglas activas del mismo tenant y evalúa
   condiciones declarativas.
4. Se crea una `AutomationExecution` con `sourceEventId` y `requestId`.
5. La cola PostgreSQL reclama ejecuciones con `FOR UPDATE SKIP LOCKED`.
6. Cada `AutomationExecutionAction` se ejecuta y conserva estado, resultado o
   error; las acciones exitosas no se repiten durante un retry.

La clave única `(organizationId, automationRuleId, sourceEventId)` hace que la
misma regla sea idempotente frente a redelivery. Las ejecuciones fallidas
reintentan hasta cinco veces con backoff exponencial acotado y quedan en el
historial para diagnóstico.

## Triggers iniciales

`ContactCreated`, `OpportunityStageChanged`, `SaleConfirmed`,
`PaymentConfirmed`, `TrialExpiring`, `TrialExpired`,
`SubscriptionRenewalDue`, `FulfillmentCompleted` y `ActivationCreated`.

El scheduler genera los triggers temporales de trials y renovaciones mediante
Outbox con una clave de deduplicación determinista.

## Acciones

- `CREATE_TASK` y `CREATE_FOLLOW_UP`: crean un seguimiento en el tenant;
- `CREATE_NOTIFICATION`: crea una notificación interna para un usuario activo;
- `ADD_ACTIVITY`: agrega una Activity con `requestId`;
- `ENQUEUE_OUTBOX`: emite otro evento interno permitido, sin integraciones;
- `INTERNAL_WEBHOOK`: registra una ejecución mock, sin red ni llamadas externas.

Los payloads se interpolan mediante paths seguros como
`{{contact.name}}` y nunca se evalúan como JavaScript. Secretos, contraseñas y
tokens no forman parte del contexto ni de los payloads.

## API y permisos

- `GET/POST/PATCH /api/v1/automations` y `POST /:id/toggle` requieren
  `automations.read/create/update`;
- `GET /api/v1/automation-executions` requiere
  `automation_executions.read`;
- `GET/POST/PATCH /api/v1/templates` y `POST /preview` requieren los permisos
  `templates.*` correspondientes;
- `GET/POST /api/v1/notifications` y sus acciones requieren
  `notifications.read/update`.

Todos los controllers están protegidos por JWT y `PermissionsGuard`. El
backend obtiene la organización del contexto autenticado y nunca acepta un
tenant desde el body.

## Operación

La cola y el Outbox son durables en PostgreSQL. El processor aísla errores de
listeners, registra fallos de acciones con auditoría y conserva el
`requestId` en ejecución, Activity, AuditLog, Notification y Outbox. Para
diagnóstico se puede consultar el historial por estado y trigger; el frontend
lo muestra en `/automation-executions`.
