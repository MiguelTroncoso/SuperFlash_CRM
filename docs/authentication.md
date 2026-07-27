# Autenticación y autorización

## Alcance

La autenticación del API está preparada para organizaciones múltiples. El contexto autenticado siempre contiene `userId`, `organizationId`, `sessionId`, `roleId` y los permisos efectivos cargados desde PostgreSQL.

## Access token

El access token es un JWT de corta duración. Solo incluye:

- `sub`: identificador del usuario.
- `organizationId`: tenant autenticado.
- `sessionId`: sesión que emitió el token.
- `roleId`: rol que tenía el usuario al emitirlo.

No contiene contraseñas, refresh tokens, hashes ni permisos. `JwtAuthGuard` valida la firma, la sesión vigente y el estado actual del usuario, organización y rol en la base de datos. Esto evita confiar indefinidamente en un JWT emitido antes de una revocación o cambio de permisos.

## Refresh token y sesiones

El refresh token es un valor opaco generado con `crypto.randomBytes`. Solo se entrega en la cookie `superflash_refresh_token`, configurada como HttpOnly, SameSite Lax, con `path=/api/v1/auth` y `secure=true` en producción.

En `AuthSession` se almacena únicamente el SHA-256 del token. La sesión conserva un `familyId`, fecha de expiración, agente de usuario, IP, uso más reciente y estado de revocación.

Cada `/refresh` ejecuta una rotación atómica:

1. Busca el hash del token actual.
2. Comprueba expiración, revocación y estado actual del usuario.
3. Revoca el token anterior.
4. Crea otro token con el mismo `familyId`.
5. Emite un nuevo JWT y actualiza la cookie.

Si un token ya rotado se reutiliza, se revoca toda la familia y se registra `AUTH_REFRESH_REUSE_DETECTED`.

## Revocación

- `logout` revoca la sesión asociada a la cookie y es idempotente.
- `logout-all` revoca todas las sesiones activas del usuario autenticado.
- Un reset de contraseña revoca todas las sesiones.
- Un JWT deja de ser aceptado si su sesión fue revocada o si el usuario, rol u organización está suspendido/eliminado.

Las sesiones y tokens de recuperación se conservan como registros revocados o usados; no se eliminan físicamente como parte del flujo normal.

## Contraseñas y recuperación

Las contraseñas se procesan con Argon2id. La política exige entre 10 y 128 caracteres, una mayúscula, una minúscula, un número y un símbolo.

`forgot-password` responde siempre el mismo mensaje para cuentas existentes e inexistentes. Para usuarios elegibles crea un `PasswordResetToken`, almacena solo su hash y aplica una expiración corta. No hay envío de correo en este sprint. En desarrollo se registra el valor necesario para pruebas locales; en producción solo se registra que se generó.

`reset-password` valida formato, hash, expiración y uso único, actualiza `passwordHash`, marca el token como usado y revoca las sesiones del usuario.

## Permisos

`PermissionsGuard` usa metadatos declarativos:

```ts
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('audit.read')
```

Los permisos efectivos se consultan en cada validación del access token. El cliente nunca puede enviar permisos ni `organizationId` para cambiar el tenant. La matriz inicial vive en el seed:

- Owner y Admin: todos los permisos actuales.
- Sales: contactos, oportunidades, ventas y pagos completos; productos y campañas en lectura.
- Viewer: permisos de lectura.

La relación Role-Permission se mantiene como relación Prisma explícita en la base de datos y el seed utiliza operaciones idempotentes.

## Aislamiento multiempresa

`AuthSession` y `PasswordResetToken` tienen claves foráneas compuestas `(organizationId, userId)` hacia `User`. Los guards consultan simultáneamente `sessionId`, `organizationId` y `userId`, por lo que un identificador válido de otro tenant no puede reutilizarse para crear contexto.

El endpoint técnico `GET /api/v1/auth/security-check` requiere un JWT vigente y `audit.read`, y devuelve únicamente el tenant y usuario autenticados.

## Auditoría y límites

Se registran los eventos `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILED`, `AUTH_REFRESH`, `AUTH_REFRESH_REUSE_DETECTED`, `AUTH_LOGOUT`, `AUTH_LOGOUT_ALL`, `PASSWORD_RESET_REQUESTED` y `PASSWORD_RESET_COMPLETED`. Nunca se almacenan contraseñas, tokens, hashes de tokens ni secretos en `AuditLog`.

Helmet, CORS con credenciales, `ValidationPipe` estricto y rate limiting protegen la superficie HTTP. Login está limitado a 5 intentos por minuto por IP y correo normalizado; forgot-password a 3 por hora; refresh tiene un límite operativo por minuto. El almacenamiento actual del rate limiter es local al proceso; Redis queda disponible para una implementación distribuida posterior.

## Configuración

Variables relevantes:

- `JWT_ACCESS_SECRET`: obligatorio y de al menos 32 caracteres en producción.
- `JWT_ACCESS_TTL_SECONDS`: por defecto 900.
- `REFRESH_TOKEN_TTL_DAYS`: por defecto 30.
- `COOKIE_SECURE`: debe ser `true` en producción.
- `SWAGGER_ENABLED`: habilita `/api/docs` en desarrollo.
- `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`, `SEED_OWNER_FIRST_NAME`, `SEED_OWNER_LAST_NAME`: opcionales para crear el Owner de desarrollo.
