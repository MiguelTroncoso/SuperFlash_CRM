# Backup y restauración de PostgreSQL

Los backups se generan fuera del repositorio, en `backups/`, una ruta ignorada
por Git. Deben copiarse además a almacenamiento externo cifrado y con acceso
restringido; el VPS no debe ser la única copia.

## Crear backup

```bash
cd /opt/superflash/app
./scripts/production/backup-postgres.sh
```

También se puede indicar el destino explícitamente:

```bash
./scripts/production/backup-postgres.sh backups/superflash-manual.sql.gz
```

El script genera un dump lógico gzip, valida su integridad y nunca imprime la
contraseña de PostgreSQL.

## Restaurar

La restauración es destructiva y debe ejecutarse durante una ventana de
mantenimiento:

```bash
CONFIRM_RESTORE=YES ./scripts/production/restore-postgres.sh \
  backups/superflash-20260729T120000Z.sql.gz
```

Antes de restaurar:

1. detener el tráfico en Nginx o poner la aplicación en mantenimiento;
2. crear un backup de seguridad del estado actual;
3. comprobar que el archivo gzip es el correcto;
4. ejecutar la restauración;
5. ejecutar `./scripts/production/deploy.sh` para validar migraciones y salud;
6. revisar login, lectura de datos y logs antes de reabrir el tráfico.

El dump no incluye ownership ni privilegios del servidor y se restaura contra
el PostgreSQL del compose de producción.
