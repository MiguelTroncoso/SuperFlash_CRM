# Webhook de WhatsApp

URL pública:

```text
https://api.superflash.site/api/v1/integrations/whatsapp/webhook
```

## Verificación

Meta llama al endpoint `GET` con `hub.mode=subscribe`,
`hub.verify_token` y `hub.challenge`. SuperFlash compara el token con el valor
cifrado configurado para una organización y devuelve únicamente el challenge.

## Recepción y firma

El `POST` exige `x-hub-signature-256` con el formato `sha256=<hex>`. La firma se
calcula sobre el body crudo con HMAC-SHA256 y el App Secret de la conexión cuyo
`metadata.phone_number_id` coincide. Un payload sin conexión o con firma inválida
se rechaza y nunca se procesa.

Después de validar, se persiste un payload sanitizado y se responde `200`.
Transactional Outbox notifica al procesador fuera del request. Los eventos
duplicados se detectan por Message ID, Status ID o huella SHA-256 del payload.

## Eventos soportados

Se guardan mensajes de texto, imagen, audio, video, documento, ubicación,
contactos, botones e interactivos. Los tipos desconocidos se conservan como
`UNKNOWN` sin detener el resto del evento. También se sincronizan estados
`sent`, `delivered`, `read` y `failed`.

Los fallos de procesamiento se reintentan con backoff. No se imprimen headers,
tokens, firmas, payloads completos ni secretos en logs o auditoría; solo se
registran datos operativos mínimos, `requestId` y códigos de error saneados.
