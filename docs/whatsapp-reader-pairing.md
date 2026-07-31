# Pairing del WhatsApp Reader

El pairing requiere configurar `WHATSAPP_READER_SERVICE_TOKEN` y `WHATSAPP_READER_ORGANIZATION_ID` en el entorno de producción. El proceso no termina hasta que el operador escanea el QR o presiona Ctrl+C.

```bash
docker compose -f docker-compose.prod.yml up -d api redis whatsapp-reader
./scripts/production/pair-whatsapp-reader.sh
```

Si la sesión ya existe, el reader informa `CONNECTED` y no genera otra sesión. Los QR vencidos se reemplazan automáticamente. `cancel` detiene el pairing sin borrar una sesión existente; `unlink` es la operación explícita que elimina la sesión persistida.
