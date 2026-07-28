# Revenue Intelligence Roadmap

## Estado

**Architecture v2.0 — Revenue Intelligence**
Estado: **IMPLEMENTED / PHASE 1**

La Phase 1 implementa únicamente lectura analítica, KPIs, funnels, cohortes,
tendencias, forecast histórico básico y dashboard ejecutivo usando datos ya
existentes. Las capacidades de atribución, gasto publicitario, IA,
integraciones externas y Analytical Event Store siguen siendo roadmap.

## Principio rector

Las plataformas externas son fuentes de tráfico. La inteligencia del negocio
vive dentro de SuperFlash Platform.

Las fuentes externas podrán aportar adquisición, campañas, referencias y
señales de interacción, pero la identidad, atribución, revenue, cohortes,
rentabilidad y decisiones comerciales deberán consolidarse en los dominios y
contratos de SuperFlash Platform.

## Capacidades futuras

El diseño futuro deberá considerar, sin implementarlas en esta etapa:

- `AcquisitionSource`
- `CampaignReference`
- `Attribution`
- `MarketingSpend`
- Funnel Analytics
- Product Performance
- Country Performance
- Seller Performance
- Customer Acquisition Cost (CAC)
- Customer Lifetime Value (LTV)
- Revenue Cohorts
- ROI
- ROAS
- Forecast
- Rankings
- AI Commercial Advisor
- Cross-selling
- Upselling
- Renewal probability
- Churn prediction

Estas capacidades deberán consumir contratos históricos y no alterar la verdad
transaccional de Sales, Payments, Subscriptions o Renewals.

## Fuentes futuras de adquisición

- Meta Ads
- Google Ads
- TikTok Ads
- WhatsApp Business
- Landing Pages
- Formularios
- Tráfico orgánico
- Referidos
- Importaciones manuales

Estas fuentes son canales de tráfico y adquisición. No serán el sistema de
registro de clientes, ventas o revenue de la plataforma.

## Integraciones financieras futuras

Las integraciones futuras podrán incluir:

- Stripe
- Mercado Pago
- Transbank
- Binance Pay
- PayPal

Su responsabilidad será transportar estados y referencias financieras hacia un
contrato controlado por SuperFlash Platform. No se implementan proveedores en
Architecture v1.0.

## Eventos analíticos futuros

Revenue Intelligence consumirá eventos desde Transactional Outbox, sin publicar
directamente desde los dominios transaccionales. Ejemplos de eventos fuente:

- `ContactCreated`
- `OpportunityCreated`
- `OpportunityStageChanged`
- `SaleConfirmed`
- `PaymentConfirmed`
- `SubscriptionActivated`
- `RenewalPaid`
- `SaleCancelled`
- `PaymentRefunded`

La taxonomía final, versionado de payloads, retención y gobernanza de PII deberán
definirse en una futura aprobación de arquitectura.

## Analytical Event Store

Como capacidad futura se prevé un **Analytical Event Store**. Su propósito será
construir métricas históricas, embudos, cohortes, atribución, forecasts y
comparaciones de rendimiento sin modificar los dominios transaccionales.

El Analytical Event Store no se crea en este roadmap: no hay tablas, migraciones
ni infraestructura analítica asociada a este cambio documental. Su diseño deberá
ser append-only, reproducible desde eventos durables y separado de las consultas
operacionales del CRM.

## Límites y dependencias

- No iniciar Providers ni Fulfillment.
- No iniciar Communications and Automations.
- No implementar WhatsApp, IA ni integraciones externas.
- La Phase 1 añade únicamente materialized views derivadas; no añade tablas ni
  modelos transaccionales. No se aceptan mutaciones desde la capa analítica.
- No usar dashboards o reportes como fuente de verdad transaccional.
- No exponer costos, revenue o métricas sin políticas de autorización y privacidad.
- La implementación futura deberá pasar por una nueva revisión y ADRs específicos.

## Secuencia orientativa

1. Formalizar contratos de adquisición y atribución.
2. Definir la taxonomía analítica y la gobernanza de datos.
3. Diseñar el Analytical Event Store.
4. Construir métricas históricas, cohortes y funnel analytics.
5. Agregar forecast y rankings con explicabilidad.
6. Evaluar capacidades de recomendación, cross-selling, upselling y predicción.

Los pasos de métricas, cohortes, funnel y forecast básico están implementados en
Phase 1. Los restantes permanecen planificados.
