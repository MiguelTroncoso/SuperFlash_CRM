# WhatsApp Provider Foundation

## Configuración

El provider lee configuración centralizada desde el entorno:

- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_GRAPH_VERSION`

Las cinco primeras variables son críticas para habilitar el provider. Si falta
cualquiera, se informa `PENDING_CONFIGURATION` sin detener la API. Nunca se
registran los valores, únicamente los nombres de variables faltantes.

## Webhook

Endpoint recomendado:

```text
GET|POST /api/v1/integrations/communication/whatsapp/webhook
```

La verificación GET valida `hub.verify_token` y devuelve el challenge. El POST
valida `X-Hub-Signature-256` sobre el cuerpo raw usando comparación segura,
registra el evento sanitizado y lo procesa mediante Outbox. El endpoint anterior
`/api/v1/integrations/whatsapp/webhook` se mantiene como compatibilidad.

## Health

`GET /api/v1/communication/channels/whatsapp/health` informa estado, versión de
Graph API, número, timestamps de entrada/salida, webhook y errores sanitizados.
`POST /api/v1/communication/channels/whatsapp/verify` valida únicamente la
configuración local y declara `externalRequestMade: false`.

Estados soportados:

- `CONNECTED`
- `DISCONNECTED`
- `AUTHENTICATION_ERROR`
- `WEBHOOK_INVALID`
- `TOKEN_INVALID`
- `EXPIRED`
- `PENDING_CONFIGURATION`

## Alcance de este sprint

No se registró la aplicación Meta, no se conectó un número oficial, no se
enviaron mensajes reales y no se activaron credenciales de producción. Sprint
26.2 realizará el go-live controlado.
