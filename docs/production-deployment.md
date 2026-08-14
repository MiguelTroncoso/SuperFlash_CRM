# Despliegue de producción

La base de despliegue está preparada para el VPS Ubuntu en
`/opt/superflash/app`. El compose de producción es independiente de
`docker-compose.yml` y únicamente publica Web y API en localhost para que
Nginx gestione los dominios y TLS.

## Preparación del VPS

```bash
sudo mkdir -p /opt/superflash
sudo chown -R ubuntu:ubuntu /opt/superflash
cd /opt/superflash
git clone https://github.com/MiguelTroncoso/SuperFlash_CRM.git app
cd app
cp .env.production.example .env.production
chmod 600 .env.production
```

Editar `.env.production` y reemplazar todos los valores de ejemplo. El
despliegue rechaza secretos de ejemplo, secretos de menos de 32 caracteres,
`COOKIE_SECURE` distinto de `true` y Swagger habilitado.

## Despliegue oficial

```bash
cd /opt/superflash/app
./scripts/production/deploy.sh
```

`deploy.sh` es el único punto de entrada soportado. Valida las variables y
Compose, crea un backup previo, sincroniza el checkout con `origin/main`,
construye las imágenes multistage, ejecuta `prisma migrate deploy`, ejecuta el
seed compilado para producción y verifica roles, permisos, pipeline y datos del
catálogo. Después inicia API y Web y ejecuta healthchecks locales y públicos.

Ante un fallo posterior a la actualización del código, el script intenta
reconstruir y verificar automáticamente la versión anterior. Las migraciones
Prisma son forward-only: el rollback automático no revierte el esquema y el
backup previo queda disponible para recuperación de datos.

Para validar configuración sin cambiar el estado del servidor:

```bash
./scripts/production/deploy.sh --validate
```

Los servicios quedan así:

| Servicio   | Acceso                  | Persistencia         |
| ---------- | ----------------------- | -------------------- |
| PostgreSQL | Solo red Docker interna | `postgres_prod_data` |
| Redis      | Solo red Docker interna | `redis_prod_data`    |
| API        | `127.0.0.1:3001`        | Stateless            |
| Web        | `127.0.0.1:3000`        | Stateless            |

Mailpit, Adminer, bind mounts de código, comandos dev y puertos públicos de
PostgreSQL/Redis no forman parte del compose de producción.

## Nginx y TLS

Copiar las referencias a `/etc/nginx/sites-available/`, crear los symlinks en
`sites-enabled`, validar y recargar Nginx:

```bash
sudo cp deploy/nginx/app.superflash.site.conf /etc/nginx/sites-available/
sudo cp deploy/nginx/api.superflash.site.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/app.superflash.site.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.superflash.site.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Los archivos iniciales sirven HTTP deliberadamente para que Certbot pueda
gestionar TLS. Después de emitir certificados, ejecutar Certbot con la
configuración estándar del VPS y conservar la redirección HTTPS.

## Operación

```bash
./scripts/production/healthcheck.sh
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
```

No ejecutar `docker compose down -v` en producción: elimina volúmenes y puede
destruir datos. Para backups y restauración consultar
[backup-restore.md](backup-restore.md). Para volver a una versión anterior
consultar [rollback.md](rollback.md).
