# Rollback de producción

El rollback debe separar la versión de aplicación de los datos. Las
migraciones Prisma son deliberadamente forward-only: no se ejecuta un
`migrate down` automático ni se modifica una migración ya aplicada.

## Rollback de aplicación

Conservar siempre el SHA actualmente desplegado y el SHA objetivo. En una
ventana de mantenimiento:

```bash
cd /opt/superflash/app
git fetch origin main --tags
git checkout <sha-estable>
./scripts/production/deploy.sh
```

Después verificar:

```bash
./scripts/production/healthcheck.sh
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Si el cambio requiere un esquema anterior incompatible, no continuar con un
rollback de código aislado: restaurar primero un backup compatible y validar
la matriz de migración en un entorno separado.

## Rollback de datos

1. detener o aislar el tráfico;
2. tomar un backup del estado actual;
3. restaurar el backup aprobado con
   `CONFIRM_RESTORE=YES ./scripts/production/restore-postgres.sh <archivo>`;
4. desplegar la versión compatible;
5. ejecutar healthchecks y smoke checks;
6. documentar el incidente y la decisión.

Nunca usar `docker compose down -v` como mecanismo de rollback. La eliminación
de volúmenes no es reversible y no sustituye un backup.
