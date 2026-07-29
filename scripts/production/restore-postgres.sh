#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/common.sh"

POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_DB="$(env_value POSTGRES_DB)"
require_env POSTGRES_USER
require_env POSTGRES_DB

backup_file="${1:-}"
if [[ -z "${backup_file}" || ! -f "${backup_file}" ]]; then
  printf 'Usage: %s <backup.sql.gz>\n' "$0" >&2
  exit 1
fi

if [[ "${CONFIRM_RESTORE:-}" != "YES" ]]; then
  printf 'Restore is destructive. Re-run with CONFIRM_RESTORE=YES to continue.\n' >&2
  exit 1
fi

gzip -t "${backup_file}"
printf 'Restoring %s into %s...\n' "${backup_file}" "${POSTGRES_DB}"
gzip -dc "${backup_file}" | compose exec -T postgres psql \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --set ON_ERROR_STOP=1

printf 'Restore completed successfully.\n'
