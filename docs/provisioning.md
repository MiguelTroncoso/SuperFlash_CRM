# Provisioning

`ProvisioningAttempt` es un historial append-only. Cada intento recibe un
número monotónico por fulfillment, un `requestId`, el snapshot solicitado y el
resultado seguro del adaptador. No se actualizan intentos anteriores; un retry
crea una fila nueva.

El contrato `ProviderAdapter` expone validación, health check, provision,
suspend, reactivate, cancel y status. `ManualProviderAdapter` y
`MockProviderAdapter` son las implementaciones locales. Las integraciones IPTV,
paneles y APIs de terceros quedan fuera de v1.1.
