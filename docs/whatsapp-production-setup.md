# Configuración de WhatsApp en producción

## Meta

1. Crear o seleccionar una aplicación de Meta de tipo Business.
2. Agregar el producto **WhatsApp** y asociar el Business Portfolio, WABA y
   número comercial de producción.
3. Crear un System User y un token permanente con `whatsapp_business_messaging`
   y `whatsapp_business_management`, limitado al WABA correcto.
4. Copiar el App Secret desde la configuración básica de la aplicación.
5. En Webhooks, configurar la URL exacta de
   `WHATSAPP_WEBHOOK_PUBLIC_URL`, generar un verify token aleatorio por
   organización y suscribir el campo `messages`.
6. En SuperFlash, abrir Configuración → Integraciones → WhatsApp, guardar WABA
   ID, Phone Number ID, número y secretos, probar la conexión y sincronizar las
   plantillas.

La URL debe llegar por HTTPS a Nginx y ser proxyada hacia `127.0.0.1:3001`.
La API no expone el token al frontend: lo cifra en la base de datos y lo usa
solo para llamadas al Graph API.

## Variables

```dotenv
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_WEBHOOK_PUBLIC_URL=https://api.superflash.site/api/v1/integrations/whatsapp/webhook
```

La URL y los secretos de cada organización se guardan en `.env.production` o
en la base cifrada según corresponda. Nunca deben versionarse.

## Prueba de producción

1. Ejecutar el healthcheck de la aplicación.
2. Usar **Probar conexión** y confirmar el estado `CONNECTED`.
3. Enviar un mensaje de prueba dentro de la ventana de 24 horas.
4. Confirmar en la bandeja la transición `SENT → DELIVERED → READ`.
5. Enviar una plantilla aprobada fuera de ventana y verificar el webhook.
