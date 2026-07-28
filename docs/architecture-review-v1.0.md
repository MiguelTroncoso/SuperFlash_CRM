# SuperFlash Platform — Architecture Review v1.0

## Commercial Core Audit

**Repositorio:** `MiguelTroncoso/SuperFlash_CRM`
**Fecha de revisión:** 2026-07-28
**Commits auditados:**

- `9bcada0928c440b022863359e2156439883aebaf` — `feat: implement commercial core domains`
- `16503b9720a6033efb5ce9b64ce80395ab76168a` — `fix: restore commercial core ci`

**Veredicto:** `REQUIRES REMEDIATION`

Este documento es exclusivamente el informe de auditoría solicitado. No implementa correcciones ni inicia Architecture v1.1.

## 1. Resumen ejecutivo

El Commercial Core tiene una base arquitectónica correcta para continuar el producto: la organización es Feature First, las entidades comerciales son multiempresa mediante `organizationId` y claves foráneas compuestas, los importes usan `Decimal`, el saldo de ventas se calcula a partir de pagos, las operaciones críticas usan transacciones cortas con bloqueos `FOR UPDATE`, y los eventos se intentan publicar después del commit.

La migración `20260801090000_commercial_core` se ejecutó desde una base vacía y sobre una base compatible existente. Prisma, seed, verificación de integridad, pruebas, lint, typecheck, builds y Docker Compose están verdes en la ejecución `30331905722`.

La implementación no debe aprobarse todavía para Architecture v1.1 por riesgos de integridad comercial y de entrega de eventos:

1. `Sale.update` valida el estado antes de abrir la transacción y no lo vuelve a comprobar bajo lock; una actualización concurrente puede modificar una venta después de `CONFIRMED`.
2. Se pueden crear y confirmar pagos para una venta `DRAFT` o `PENDING`.
3. `idempotencyKey` no compara la solicitud repetida y una colisión concurrente puede escapar como una violación Prisma no mapeada.
4. Una suscripción puede nacer desde un `SaleItem` de una venta no confirmada o de un producto que no requiere suscripción.
5. No existe una identidad persistente de ciclo para garantizar unicidad histórica de renovaciones.
6. El pago de una renovación no revalida que la suscripción siga activa.
7. El snapshot no conserva el costo ni todos los datos necesarios para reconstrucción independiente; el snapshot de `Renewal` es aún más reducido.
8. El bus de eventos es un `EventEmitter` en memoria: un reinicio puede perder eventos y una excepción de listener puede convertir una operación ya confirmada en un error visible.

No se identificaron hallazgos `CRITICAL`. La combinación de hallazgos `HIGH` sí requiere remediación antes de declarar el núcleo comercial listo para la siguiente evolución arquitectónica.

### Resumen por severidad

| Severidad | Cantidad | Resultado                    |
| --------- | -------: | ---------------------------- |
| CRITICAL  |        0 | No observado                 |
| HIGH      |        9 | Bloquea aprobación           |
| MEDIUM    |        7 | Requiere plan de remediación |
| LOW       |        2 | Deuda no bloqueante          |
| INFO      |        2 | Observaciones de contexto    |

## 2. Estado por dominio

| Dominio              | Estado               | Evaluación                                                                                                                                                                            |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales                | Parcial              | Agregado, Decimal, aislamiento y transiciones básicas correctos; existe una carrera contra la inmutabilidad confirmada y falta una política explícita para cancelar ventas con pagos. |
| SaleItem             | Requiere remediación | Guarda referencias tipadas y JSON snapshot, pero no conserva costo/mínimo ni existe una protección explícita de inmutabilidad posterior a confirmación.                               |
| Payments             | Parcial              | Pagos parciales, balance derivado, reembolsos y locks principales están implementados; faltan precondiciones de estado e idempotencia completa.                                       |
| Refunds              | Parcial              | El límite contra `netAmount` y la serialización por pago son correctos; faltan Activity y una semántica operativa más completa para el ciclo de reembolso.                            |
| Subscriptions        | Requiere remediación | Snapshot y lifecycle explícito existen; la creación no exige una venta confirmada ni un ítem elegible.                                                                                |
| Renewals             | Requiere remediación | Pago idempotente por renovación y generación de venta nueva funcionan; no hay unicidad de ciclo y el pago no revalida el estado de la suscripción.                                    |
| Migración            | Parcial              | Foreign keys, índices, checks y compatibilidad básica están presentes; el backfill legacy no puede reconstruir snapshots completos y algunas invariantes siguen solo en aplicación.   |
| Eventos              | Requiere remediación | Eventos mínimos y publicación post-commit existen, pero el transporte no es durable y no incluye `requestId`.                                                                         |
| Auditoría / Activity | Parcial              | Se registran muchas operaciones con actor, tenant e IP; faltan `requestId`, Activity para varias operaciones y consistencia uniforme de before/after.                                 |
| Policies / permisos  | Bueno con límites    | Guards, permisos y ownership por rol están centralizados; las precondiciones de dominio descritas arriba no pueden delegarse a la policy actual.                                      |
| Multiempresa         | Bueno                | Las consultas filtran por tenant y las relaciones comerciales usan FKs compuestas. No se observó una ruta funcional que acepte `organizationId` del cliente para seleccionar tenant.  |
| API REST             | Bueno                | DTOs, UUID pipes, whitelist global, guards, paginación, filtros y OpenAPI están configurados.                                                                                         |
| Pruebas              | Parcial              | CI verde y concurrencia principal cubierta; faltan escenarios críticos de transición, migración legacy, idempotencia conflictiva, snapshots completos y entrega de eventos.           |
| Documentación / ADR  | Parcial              | Existen `docs/sales.md`, `payments.md`, `subscriptions.md`, `renewals.md`, `domain-model.md` y ADR-006 a ADR-009; no documentan las invariantes pendientes.                           |

## 3. Hallazgos CRITICAL

No se identificaron hallazgos `CRITICAL` durante la revisión.

## 4. Hallazgos HIGH

### H-01 — La venta puede mutarse después de `CONFIRMED`

**Archivo y bloque:** `apps/api/src/modules/sales/sales.service.ts:237-307`, método `update`.

**Descripción:** El método lee `status`, `discountAmount`, `taxAmount` y `note` antes de iniciar la transacción. Después calcula el subtotal fuera de la transacción y ejecuta `sale.update` sin lock, sin condición de estado y sin comprobar `version`.

**Impacto:** Una venta que ya fue confirmada puede quedar con descuentos, impuestos, total o nota modificados. Esto rompe la inmutabilidad económica del acuerdo y permite que el resultado devuelto no corresponda al estado que autorizó la mutación.

**Escenario reproducible:** Crear una venta `DRAFT`. Iniciar `PATCH /sales/:id` y detener la solicitud después de la lectura inicial. Ejecutar `POST /sales/:id/confirm` y esperar el commit. Reanudar el `PATCH`: la transacción actualiza la venta sin volver a comprobar el estado `CONFIRMED`.

**Corrección recomendada:** Leer y bloquear la venta dentro de la misma transacción, volver a validar el estado bajo lock y usar actualización condicional por `version` o un control optimista equivalente. Las actualizaciones de `SaleItem` y snapshots también deben quedar prohibidas después de confirmar.

### H-02 — Se aceptan pagos para ventas no confirmadas

**Archivo y bloque:** `apps/api/src/modules/payments/payments.service.ts:41-64` (`create`) y `:152-192` (`confirm`).

**Descripción:** La creación rechaza solamente ventas `CANCELLED`; la confirmación bloquea la venta y valida el balance, pero no exige que el estado de la venta sea `CONFIRMED` o `FULFILLED`.

**Impacto:** El sistema puede registrar dinero confirmado contra un acuerdo en borrador o pendiente. Esto desordena el lifecycle comercial y permite que un pago produzca saldo contable antes de que exista un acuerdo confirmado.

**Escenario reproducible:** Crear una venta `DRAFT`, registrar un pago `PENDING` y llamar a `POST /payments/:id/confirm`. La operación termina correctamente y el balance incluye el pago aunque la venta nunca fue confirmada.

**Corrección recomendada:** Definir y aplicar una precondición explícita de estado de venta para crear y confirmar pagos. Si se necesita aceptar anticipos sobre `DRAFT`, modelarlo como una regla de dominio distinta y auditable, no como efecto implícito del estado actual.

### H-03 — Idempotencia de pagos incompleta

**Archivo y bloque:** `apps/api/src/modules/payments/payments.service.ts:55-64`; `apps/api/prisma/schema.prisma:946-980`.

**Descripción:** Si existe `idempotencyKey`, el servicio devuelve el primer pago sin comparar importe, moneda, venta, método ni referencia. Además, dos solicitudes concurrentes pueden pasar el `findFirst` vacío y una de ellas fallar en `payment.create` por `P2002`, sin mapear la colisión a una respuesta de idempotencia o conflicto de dominio.

**Impacto:** Un cliente que reutilice accidentalmente una clave con otro importe recibe la respuesta del pago anterior sin saber que su solicitud fue distinta. Bajo concurrencia, la misma operación no tiene un resultado determinista.

**Escenario reproducible:** Crear un pago de `10.00` con clave `k1`; repetir con la misma clave y `100.00`: se devuelve el pago de `10.00`. Para la carrera, enviar dos solicitudes simultáneas con una clave nueva: ambas pueden leer ausencia y una puede terminar con un error Prisma no mapeado.

**Corrección recomendada:** Persistir una huella canónica de los campos idempotentes y rechazar reutilizaciones incompatibles con un error de dominio. Capturar `P2002`, releer el registro ganador y devolver el resultado idempotente. La operación debe mantener la misma política por organización.

### H-04 — Suscripción elegible desde una venta no confirmada

**Archivo y bloque:** `apps/api/src/modules/subscriptions/subscriptions.service.ts:30-105`, método `createFromSaleItem`.

**Descripción:** La única restricción de estado de la venta es `CANCELLED`. No se exige `CONFIRMED`/`FULFILLED` ni `requiresSubscriptionSnapshot === true` antes de crear la suscripción.

**Impacto:** Puede nacer una obligación recurrente desde un acuerdo que todavía no existe como venta confirmada o desde un producto de pago único. Activarla después consolida un lifecycle comercial inválido.

**Escenario reproducible:** Crear una venta `DRAFT` con un producto `requiresSubscription=false`; llamar a `POST /subscriptions/from-sale-item/:saleItemId`; la suscripción `PENDING` se crea y puede avanzar a `ACTIVE`.

**Corrección recomendada:** Exigir venta confirmada o fulfilled, ítem no eliminado y snapshot de producto elegible para suscripción. Validar además la coherencia entre plan, ciclo y `customIntervalDays` bajo la misma transacción bloqueada.

### H-05 — No existe unicidad persistente por ciclo de renovación

**Archivo y bloque:** `apps/api/src/modules/renewals/renewals.service.ts:73-94`; `apps/api/prisma/schema.prisma:1040-1076`.

**Descripción:** La consulta evita solamente renovaciones no pagadas (`PENDING`, `DUE`, `OVERDUE`). La base no tiene `cycleKey`, periodo o una restricción única que identifique el ciclo de una suscripción. La unicidad existente de `generatedSaleId` protege la venta generada, no la creación de la renovación.

**Impacto:** La serialización por suscripción evita dos pendientes concurrentes, pero no evita dos renovaciones históricas para el mismo ciclo. Un reintento con el mismo `dueAt` después de pagar puede crear otra renovación para el mismo periodo.

**Escenario reproducible:** Crear una renovación para una suscripción con `dueAt = T`, pagarla y volver a llamar `from-subscription` con `dueAt = T`. La renovación pagada queda fuera del filtro de duplicados y se crea una nueva fila para el mismo ciclo.

**Corrección recomendada:** Modelar explícitamente el periodo (`periodStart`, `periodEnd` o `cycleKey`) y añadir una restricción única por organización, suscripción y ciclo. Derivar o validar `dueAt` contra el siguiente periodo permitido y mapear la colisión a un resultado idempotente.

### H-06 — El pago de renovación no revalida el estado de la suscripción

**Archivo y bloque:** `apps/api/src/modules/renewals/renewals.service.ts:171-245`, método `pay`.

**Descripción:** El método comprueba que la renovación no esté `CANCELLED`, pero después solo carga `subscription.status`; no rechaza `CANCELLED` ni `EXPIRED` antes de crear la nueva venta, pago y actualización de periodo.

**Impacto:** Una suscripción finalizada puede generar nuevas ventas confirmadas y avanzar sus fechas de cobro. Esto contradice la semántica de lifecycle y puede producir cobros para servicios cancelados o expirados.

**Escenario reproducible:** Crear una renovación pendiente, cancelar o expirar la suscripción, y luego llamar a `POST /renewals/:id/pay`. La transacción crea `Sale`, `SaleItem` y `Payment` confirmados.

**Corrección recomendada:** Bajo el lock de la renovación, bloquear y revalidar la suscripción. Permitir únicamente el estado documentado para cobrar, o introducir una transición explícita de gracia que sea auditable y consistente con el periodo.

### H-07 — Snapshots insuficientes para reconstrucción histórica

**Archivo y bloque:** `apps/api/src/modules/sales/sales.service.ts:45-68` y `:483-566`; `apps/api/prisma/schema.prisma:900-924`, `:1040-1056`.

**Descripción:** `buildItem` selecciona de `PriceBookEntry` solamente `id`, `salePrice` y `taxIncluded`; no guarda `costPrice` ni `minimumPrice`. `SaleItem` tampoco tiene campos tipados para esos datos. `Renewal` conserva solo nombre, SKU y `catalogSnapshot`, sin cantidad, plan, variante o duración tipadas propias.

**Impacto:** La venta no puede reconstruir costo/margen ni todas las reglas del catálogo que participaron en el acuerdo. La renovación depende para algunos datos de `Subscription`/`SaleItem` originales, en vez de ser autosuficiente como snapshot de su propio ciclo.

**Escenario reproducible:** Crear una venta con una entrada de precio con costo, cambiar posteriormente el catálogo y consultar el detalle histórico: el SaleItem no contiene el costo. Crear una renovación y eliminar o alterar los datos vivos asociados: la fila Renewal no tiene por sí sola todos los atributos necesarios para reconstruir el producto vendido.

**Corrección recomendada:** Definir un contrato de snapshot versionado con producto, SKU, tipo, plan, variante, precio, costo, moneda, duración, fulfillment, impuestos y metadata. Mantener el costo fuera de respuestas no autorizadas, pero persistirlo de forma protegida. Copiar el snapshot completo al crear cada renovación y bloquear ediciones posteriores a confirmación.

### H-08 — El bus de eventos es efímero y no aísla fallos de listeners

**Archivo y bloque:** `apps/api/src/infrastructure/events/application-event-bus.ts:23-40`; publicación desde `apps/api/src/modules/sales/sales.service.ts:694-707` y equivalentes de Payments, Subscriptions y Renewals.

**Descripción:** `ApplicationEventBus` extiende `EventEmitter` y publica mediante `this.emit` síncrono. El contrato no incluye `requestId`. Las llamadas se hacen después del commit, pero no existe outbox ni persistencia del evento.

**Impacto:** Si el proceso termina entre el commit y `emit`, el cambio de base queda sin evento. Si un listener lanza una excepción, `emit` la propaga al request aunque la transacción ya confirmó; en operaciones como renovación se pueden publicar algunos eventos y no los siguientes. Esto puede provocar reintentos, pérdida de integración y observabilidad inconsistente.

**Escenario reproducible:** Registrar un listener que lance un error para `PaymentConfirmed`: el pago queda confirmado y el endpoint puede responder con error. Alternativamente, terminar el proceso después del commit de una venta y antes de `publish`: no existe registro durable para recuperar el evento.

**Corrección recomendada:** Persistir un outbox en la misma transacción con `eventId`, `occurredAt`, `organizationId`, `aggregateId`, actor y `requestId`; despachar de forma asíncrona con reintentos, deduplicación y monitoreo. Aislar errores de listeners del request y garantizar que un fallo no modifique ni oculte el resultado transaccional confirmado.

### H-09 — Cancelación de venta sin reconciliación de pagos

**Archivo y bloque:** `apps/api/src/modules/sales/sales.service.ts:318-330` y `:649-655`; `apps/api/src/modules/payments/payments.service.ts:41-54`.

**Descripción:** La transición permite cancelar una venta `CONFIRMED` y no revisa pagos confirmados. Los pagos permanecen `CONFIRMED` o `REFUNDED`; no existe una regla que rechace la cancelación, obligue a reembolsar o genere una compensación.

**Impacto:** Una venta cancelada puede conservar dinero confirmado y aparecer con saldo derivado activo. El estado del acuerdo y el estado financiero dejan de representar una política comercial única.

**Escenario reproducible:** Crear y confirmar una venta, crear y confirmar un pago, y luego llamar a `POST /sales/:id/cancel`. La venta cambia a `CANCELLED` mientras el pago sigue confirmado.

**Corrección recomendada:** Definir una política explícita: rechazar cancelación con pagos confirmados, iniciar un flujo de reembolso obligatorio, o permitirla solamente con una compensación auditada. La regla debe ejecutarse bajo locks de venta y pagos relevantes.

## 5. Hallazgos MEDIUM

### M-01 — Auditoría y Activity no tienen correlación de request ni cobertura uniforme

**Archivo y bloque:** `apps/api/prisma/schema.prisma:508-541` (`Activity`), `:1128-1149` (`AuditLog`), `apps/api/src/modules/audit/audit.service.ts:6-40`; Payments `:227-318`; Renewals `:101-109`, `:421-437`, `:464-472`.

**Descripción:** Ni `Activity` ni `AuditLog` tienen `requestId`. Refund y fail registran AuditLog pero no Activity; creación, due y cancelación de Renewal tampoco generan Activity. Varias operaciones de creación registran solo `newValue`, sin una convención documentada para before/after.

**Impacto:** Es difícil reconstruir una operación distribuida o correlacionar logs, request, auditoría y eventos. El timeline comercial queda incompleto para soporte, cumplimiento y diagnóstico.

**Escenario reproducible:** Ejecutar un refund, un payment fail y una renovación cancelada; consultar Activities del contacto/venta: no existe evento de Activity equivalente, aunque sí existe una auditoría parcial.

**Corrección recomendada:** Incorporar `requestId` a contexto, eventos, auditoría y Activity. Definir una matriz de operaciones que indique cuándo se registra Activity y cuándo se requieren before/after, actor, tenant, motivo e IP. Mantener los registros como append-only desde la aplicación y la base.

### M-02 — Se pueden vender productos o precios no comercializables

**Archivo y bloque:** `apps/api/src/modules/sales/sales.service.ts:483-546`; `apps/api/prisma/schema.prisma:620-669`, `:763-829`.

**Descripción:** La búsqueda de producto y `PriceBookEntry` filtra `deletedAt`, pero no exige `Product.status=ACTIVE`, `Product.active`, `PriceBook.status=ACTIVE`, vigencia o `PriceBookEntry.active`. Además, `unitPrice` puede ser entregado directamente y no se compara con `minimumPrice` ni requiere una autorización de override.

**Impacto:** Una venta puede incorporar catálogo inactivo, archivado comercialmente o un precio inferior al mínimo permitido. El snapshot conserva el resultado, pero conserva también un acuerdo que el catálogo no autorizaba.

**Escenario reproducible:** Crear un producto `DRAFT` o una entrada de precio inactiva y llamar a `POST /sales` con sus IDs; la operación puede continuar. Enviar `unitPrice` por debajo del `minimumPrice`: no se aplica una política de precio mínimo.

**Corrección recomendada:** Reutilizar un resolvedor de catálogo que valide estado, vigencia, moneda, combinación, precio mínimo y autorización explícita para overrides. Persistir en el snapshot la fuente y regla de precio aplicada.

### M-03 — Parte de la integridad comercial existe solo en la capa de aplicación

**Archivo y bloque:** `apps/api/prisma/migrations/20260801090000_commercial_core/migration.sql:349-367`; `apps/api/src/modules/commercial/commercial.types.ts:22-41`.

**Descripción:** La migración agrega checks útiles de no negatividad y reembolso, pero no protege en base la fórmula `subtotal - discount + tax = total`, la consistencia de moneda, la relación entre `netAmount`, `grossAmount` y `feeAmount`, ni la obligación de `customIntervalDays` para `CUSTOM`.

**Impacto:** Otro proceso, una operación administrativa o una futura ruta que omita el servicio puede crear datos aceptados por PostgreSQL pero incompatibles con los cálculos del dominio.

**Escenario reproducible:** Insertar o actualizar directamente un `Sale` con `total` distinto del subtotal ajustado, una moneda arbitraria de tres caracteres o una suscripción `CUSTOM` sin intervalo; los checks actuales no lo impiden.

**Corrección recomendada:** Añadir constraints que sean expresables de forma segura, dominios de moneda/códigos normalizados y validación transaccional para invariantes que involucren varias filas. Mantener las validaciones de aplicación como primera línea, no como única garantía.

### M-04 — Backfill legacy no conserva un snapshot comercial completo

**Archivo y bloque:** `apps/api/prisma/migrations/20260801090000_commercial_core/migration.sql:79-92`, `:95-108`, `:129-136`.

**Descripción:** Métodos legacy no reconocidos se convierten a `OTHER`, `Sale.contactId` se reconstruye desde Opportunity y un `SaleItem` sin snapshot recibe únicamente `productName`, `sku` y `source=legacy-migration`.

**Impacto:** La migración es ejecutable, pero algunos datos históricos pierden semántica original o no pueden reconstruirse como snapshots comerciales completos. La pérdida es silenciosa para métodos desconocidos.

**Escenario reproducible:** Migrar una fila Payment con un método legacy fuera del conjunto conocido o un SaleItem sin datos de catálogo modernos; después de migrar, el método aparece como `OTHER` y el snapshot no contiene precio, costo, moneda, duración ni fulfillment.

**Corrección recomendada:** Generar un reporte de datos transformados, conservar el valor legacy en un campo de compatibilidad o metadata controlada, fallar con diagnóstico cuando una transformación sea ambigua y documentar explícitamente la degradación de snapshots históricos.

### M-05 — Falta cobertura de transiciones y reglas negativas del lifecycle

**Archivo y bloque:** `apps/api/test/commercial.e2e-spec.ts:98-337`; `apps/api/test/commercial.unit.spec.ts:61-177`.

**Descripción:** Las pruebas cubren creación, confirmación concurrente, conversión, balance, reembolso parcial, una suscripción activa, renovaciones concurrentes, tenant, DTO y permisos. No cubren de forma explícita la carrera de `Sale.update`, confirmación de pago sobre venta DRAFT, idempotency key con payload diferente, estado de producto no comercializable, suscripción desde venta no confirmada, pago de renewal con suscripción cancelada, duplicado de renewal de un ciclo ya pagado, ni listener fallido.

**Impacto:** La suite verde no detecta los escenarios que originan los hallazgos HIGH. El número acumulado de pruebas no equivale a cobertura de invariantes.

**Escenario reproducible:** Todos los casos descritos pueden ejecutarse contra el flujo HTTP actual sin que exista una prueba que los rechace; la suite finaliza verde porque esos comportamientos no están definidos como casos negativos.

**Corrección recomendada:** Añadir pruebas unitarias e integración aisladas por cada invariante, incluyendo carreras controladas, payload de idempotencia conflictivo, lifecycle inválido, listener con error, migración legacy y snapshots completos. No eliminar ni omitir las pruebas existentes.

### M-06 — `AuditLog` es append-only por convención, no por garantía de persistencia

**Archivo y bloque:** `apps/api/prisma/schema.prisma:1128-1149`; `apps/api/src/modules/audit/audit.service.ts:27-40`.

**Descripción:** El modelo solo expone campos de creación y el servicio solo inserta, pero no existe una restricción de base, trigger o privilegio separado que impida `UPDATE`/`DELETE` a un rol con acceso de escritura.

**Impacto:** Una operación administrativa o una futura ruta podría modificar o eliminar evidencia histórica sin que la capa de dominio lo detecte.

**Escenario reproducible:** Ejecutar una mutación directa sobre `AuditLog` con el mismo usuario de base que usa la aplicación: PostgreSQL no tiene una política visible en este esquema que impida la modificación física.

**Corrección recomendada:** Separar privilegios de escritura, usar una tabla append-only o trigger de protección y auditar intentos de modificación. Complementar la protección de base con un servicio de lectura separado.

### M-07 — Las renovaciones pueden marcarse `DUE` antes de su fecha

**Archivo y bloque:** `apps/api/src/modules/renewals/renewals.service.ts:445-477`, método `transitionDue`.

**Descripción:** La transición permite `PENDING` o `OVERDUE` a `DUE`, pero no compara `dueAt` con el reloj ni exige una tarea programada autorizada como origen.

**Impacto:** Una llamada manual puede adelantar el estado de cobro y habilitar procesos posteriores antes del vencimiento real.

**Escenario reproducible:** Crear una renovación con `dueAt` futuro y llamar inmediatamente a `POST /renewals/:id/due`; el estado cambia a `DUE`.

**Corrección recomendada:** Validar la fecha o distinguir un comando administrativo de un job de vencimiento, con permiso explícito, motivo y auditoría.

## 6. Hallazgos LOW

### L-01 — La moneda solo se normaliza sintácticamente

**Archivo y bloque:** `apps/api/src/modules/commercial/commercial.types.ts:22-24`; DTOs de Sales y Payments.

**Descripción:** `normalizeCurrency` hace trim y uppercase; el DTO limita a tres caracteres, pero no valida un código ISO 4217 ni una lista configurada.

**Impacto:** Se pueden almacenar códigos de tres caracteres no reconocidos. El sistema conserva consistencia interna entre Sale y Payment, pero reportes, integraciones y conversiones futuras pueden interpretar monedas inválidas.

**Escenario reproducible:** Crear una venta con `currency=ABC`; pasa la validación de longitud y se persiste.

**Corrección recomendada:** Usar una lista ISO configurada y versionada, o un catálogo de monedas por organización, manteniendo la misma normalización en todas las entradas.

### L-02 — La documentación presenta invariantes como resueltas sin delimitar sus condiciones

**Archivo y bloque:** `README.md:262-284`; `docs/payments.md:21-23`; `docs/domain-model.md:128-134`; `docs/ADR-006-sales-snapshot.md`; `docs/ADR-009-renewal-engine.md`.

**Descripción:** La documentación afirma snapshots completos, reintentos seguros e idempotencia de renovación, pero no especifica las limitaciones detectadas: costo ausente, conflicto de payload de idempotencia, ciclo no persistido ni outbox.

**Impacto:** Los consumidores pueden asumir garantías más fuertes que las implementadas y diseñar integraciones sobre contratos incompletos.

**Corrección recomendada:** Actualizar la documentación junto con cada remediación y declarar explícitamente las invariantes garantizadas, las precondiciones de estado y los límites de idempotencia.

## 7. Hallazgos INFO

### I-01 — CI está verde con una anotación no bloqueante de Node.js

**Archivo y bloque:** `.github/workflows/ci.yml`; ejecución `30331905722`.

**Descripción:** La ejecución actual terminó `success` en todos los pasos. GitHub mantiene una advertencia de deprecación del runtime Node.js usado por actions, sin fallo del job.

**Impacto:** No afecta la integridad actual, pero puede requerir actualización futura de actions para evitar una interrupción del workflow.

**Escenario reproducible:** Abrir la ejecución exitosa en GitHub: el job `quality` está verde y aparece una anotación warning sobre Node.js 20 deprecado en actions.

**Corrección recomendada:** Planificar la actualización de las actions a versiones/runtime soportados cuando GitHub lo requiera, sin ocultar la anotación ni desactivar validaciones.

### I-02 — No se observaron pruebas omitidas o deshabilitadas

**Archivo y bloque:** `apps/api/test/**/*.spec.ts`, `apps/api/test/**/*.e2e-spec.ts`, `.github/workflows/ci.yml`.

**Descripción:** La inspección no encontró `skip`, `only`, `xit`, `xdescribe`, `TODO` o `FIXME` usados para omitir validaciones de la suite auditada.

**Impacto:** La evidencia de CI es representativa de los comandos configurados, aunque no cubre por sí sola los escenarios faltantes indicados en M-05.

**Escenario reproducible:** Buscar esos patrones en los archivos de pruebas y workflow no devuelve coincidencias.

**Corrección recomendada:** Mantener esta condición y añadir cobertura explícita para los riesgos, sin convertir casos en skip ni reducir la suite.

## 8. Riesgos de producción

Los riesgos prioritarios antes de la siguiente evolución son:

1. **Integridad del acuerdo:** una carrera puede modificar una venta confirmada.
2. **Integridad financiera:** puede confirmarse dinero sobre una venta no confirmada y cancelar una venta con pagos confirmados sin reconciliación.
3. **Duplicación operativa:** el contrato de idempotencia de pagos y el ciclo de renovaciones no están completamente protegidos por base y aplicación.
4. **Cobro indebido:** una renovación puede cobrarse después de cancelar o expirar la suscripción.
5. **Reconstrucción histórica:** falta costo y parte del contexto catalogal en snapshots.
6. **Entrega de eventos:** los eventos se pueden perder o fallar después del commit sin mecanismo durable de recuperación.
7. **Trazabilidad:** no existe correlación por request y el timeline Activity es incompleto para operaciones comerciales.

## 9. Cobertura faltante

Además de los casos incluidos en M-05, la revisión identificó ausencia de pruebas específicas para:

- intento de editar `SaleItem` o snapshots después de `CONFIRMED`;
- confirmación repetida de un pago parcialmente reembolsado y reembolso concurrente del mismo pago;
- descuento/impuesto que deje fórmulas inconsistentes o exceda los límites de negocio;
- `CUSTOM` sin intervalo, cambio de mes y fechas de periodo en todos los ciclos;
- transición inválida de venta, suscripción y renovación;
- creación de una renovación con el mismo periodo después de `PAID`;
- cancelación de venta con pagos confirmados;
- producto, plan, variante o PriceBookEntry inactivos;
- payload conflictivo con la misma `idempotencyKey`;
- fallo de listener después de un commit;
- persistencia y correlación de `requestId` en AuditLog/Activity/evento;
- backfill de una base anterior con filas legacy ambiguas u huérfanas;
- verificación de que una modificación de catálogo nunca altera la lectura histórica completa.

## 10. Deuda técnica

- No existe una capa outbox ni un dispatcher durable para eventos.
- El contexto de request solo transporta IP y user-agent; no transporta correlación.
- Varias reglas de lifecycle están dispersas en servicios y no en invariantes reutilizables de dominio.
- `version` existe en modelos comerciales, pero no se usa como control optimista en `Sale.update`.
- El contrato de snapshot no está centralizado ni versionado.
- La unicidad de renovación no tiene un concepto explícito de periodo.
- La protección de append-only de auditoría no está reforzada en la base.
- Las pruebas de migración ejecutan el flujo, pero no cubren transformaciones legacy ambiguas con fixtures representativos.

## 11. Recomendaciones priorizadas

### Antes de Architecture v1.1

1. Corregir la carrera de actualización y hacer cumplir la inmutabilidad post-confirmación.
2. Fijar las precondiciones de estado para pagos, suscripciones, renovaciones y cancelaciones.
3. Completar idempotencia de pagos con huella de payload y manejo de colisión concurrente.
4. Modelar y restringir el ciclo de renovación en la base.
5. Completar snapshots y definir qué campos se persisten pero nunca se exponen sin permiso.
6. Introducir outbox o una garantía equivalente de entrega, con `requestId` y aislamiento de listeners.
7. Completar auditoría/Activity y ampliar pruebas negativas y de concurrencia.

### Después de remediar los bloqueos

1. Reforzar constraints monetarias y de moneda en base de datos.
2. Convertir la validación de catálogo activo, vigencia y precio mínimo en un servicio de resolución único.
3. Proteger `AuditLog` con privilegios y/o triggers append-only.
4. Actualizar ADR y documentación para reflejar garantías verificadas, no intenciones.
5. Planificar actualización de actions por la advertencia de runtime de GitHub.

## 12. Veredicto final

**REQUIRES REMEDIATION**

La arquitectura general es una base razonable y la ejecución de CI es reproducible y verde, pero existen riesgos `HIGH` que pueden producir acuerdos mutables, pagos prematuros, cobros inválidos, duplicados y pérdida de eventos. El Commercial Core no debe considerarse aprobado para Architecture v1.1 hasta que esos riesgos sean corregidos y cubiertos con pruebas.

## 13. Evidencia revisada

### Archivos principales revisados

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260801090000_commercial_core/migration.sql`
- `apps/api/src/modules/sales/sales.service.ts`
- `apps/api/src/modules/sales/sales.controller.ts`
- `apps/api/src/modules/sales/dto/sales.dto.ts`
- `apps/api/src/modules/payments/payments.service.ts`
- `apps/api/src/modules/payments/payments.controller.ts`
- `apps/api/src/modules/subscriptions/subscriptions.service.ts`
- `apps/api/src/modules/subscriptions/subscriptions.controller.ts`
- `apps/api/src/modules/renewals/renewals.service.ts`
- `apps/api/src/modules/renewals/renewals.controller.ts`
- `apps/api/src/modules/commercial/commercial.policy.ts`
- `apps/api/src/infrastructure/events/application-event-bus.ts`
- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/app-setup.ts`
- `apps/api/test/commercial.unit.spec.ts`
- `apps/api/test/commercial.e2e-spec.ts`
- todos los specs existentes bajo `apps/api/test/`
- `README.md`, `docs/domain-model.md`, `docs/sales.md`, `docs/payments.md`, `docs/subscriptions.md`, `docs/renewals.md` y ADR-006 a ADR-009
- `.github/workflows/ci.yml`

### Pruebas y validaciones examinadas

La ejecución exitosa de GitHub Actions `30331905722` (`16503b9720a6033efb5ce9b64ce80395ab76168a`) terminó en verde con estos pasos relevantes:

- Prisma Generate Client
- Validate Prisma schema
- Apply database migrations
- Run seed twice
- Verify database integrity
- Prettier
- 113 unit tests
- Apply isolated domain migrations
- 92 integration tests
- Lint
- Typecheck
- Build frontend
- Build backend
- Validate and start Docker Compose
- Stop Docker Compose

También se verificó que no hay pruebas omitidas o deshabilitadas mediante `skip`, `only`, `xit` o `xdescribe` en la suite auditada.

**CI:** [ejecución 30331905722](https://github.com/MiguelTroncoso/SuperFlash_CRM/actions/runs/30331905722) — `success`.

**Estado esperado para esta fase:** este commit agrega únicamente el informe; no modifica código funcional, migraciones ni pruebas.
