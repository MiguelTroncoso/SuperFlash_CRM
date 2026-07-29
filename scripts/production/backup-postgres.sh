#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/common.sh"

POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_DB="$(env_value POSTGRES_DB)"
require_env POSTGRES_USER
require_env POSTGRES_DB

backup_directory="${APP_DIR}/backups"
mkdir -p "${backup_directory}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${1:-${backup_directory}/superflash-${timestamp}.sql.gz}"

if [[ -e "${backup_file}" ]]; then
  printf 'Backup file already exists: %s\n' "${backup_file}" >&2
  exit 1
fi

printf 'Creating PostgreSQL backup at %s...\n' "${backup_file}"
compose exec -T postgres pg_dump \
  --no-owner \
  --no-privileges \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" | gzip -c > "${backup_file}"

gzip -t "${backup_file}"
printf 'Backup completed successfully: %s\n' "${backup_file}"
