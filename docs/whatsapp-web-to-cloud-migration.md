# Migración de WhatsApp Web a Cloud API

WhatsApp Web Bridge es transitorio y no es el destino productivo permanente.
La migración futura debe:

1. configurar y verificar una conexión oficial de Meta Cloud API;
2. mantener el mismo contrato interno de Communication;
3. detener el bridge y bloquear nuevos eventos antes del cambio;
4. no importar historial desde WhatsApp Web;
5. conservar conversaciones y mensajes ya ingresados en Smart Inbox;
6. habilitar envío únicamente después de pruebas, permisos y auditoría;
7. verificar que `source=WHATSAPP` y la atribución existente no se alteren.

No se deben mezclar sesiones, secretos ni payloads de ambos providers. El
bridge no debe permanecer como mecanismo de fallback automático cuando Cloud
API esté activa.
