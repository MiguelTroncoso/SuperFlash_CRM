# WhatsApp Web Pairing

El pairing es una operación administrativa, manual y temporal.

## Procedimiento

1. Confirmar que el bridge está desplegado con `WHATSAPP_WEB_BRIDGE_ENABLED=true`.
2. Crear un `WHATSAPP_BRIDGE_CHANNEL_KEY` único y configurarlo en API y bridge.
3. Iniciar sesión como usuario con `whatsapp.manage`.
4. Abrir `/settings/channels/whatsapp-web` y habilitar el canal.
5. Pulsar `Generar QR` y escanear desde WhatsApp Business.
6. Esperar estado `CONNECTED` y verificar que el primer mensaje aceptado ocurre
   después de `ingestionStartedAt`.

El QR no se persiste, no aparece en logs ni se devuelve a usuarios con solo
`whatsapp.read`. Si expira, solicitar otro. No se importa historial existente.

Para desvincular, usar `Desvincular`; para una pausa operacional usar
`Deshabilitar`. El bridge no debe rotar cuentas, evadir límites ni simular
actividad humana.
