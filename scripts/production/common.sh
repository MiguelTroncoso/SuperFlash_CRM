#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${APP_DIR}/docker-compose.prod.yml}"
ENV_FILE="${PRODUCTION_ENV_FILE:-${APP_DIR}/.env.production}"

if [[ ! -f "${ENV_FILE}" ]]; then
  printf 'Missing production environment file: %s\n' "${ENV_FILE}" >&2
  exit 1
fi

env_value() {
  local key="$1"
  awk -v key="${key}" 'index($0, key "=") == 1 { sub(/^[^=]*=/, ""); print; exit }' "${ENV_FILE}"
}

require_env() {
  local key="$1"
  local value
  value="$(env_value "${key}")"
  if [[ -z "${value}" ]]; then
    printf 'Missing required production variable: %s\n' "${key}" >&2
    exit 1
  fi
}

compose() {
  PRODUCTION_ENV_FILE="${ENV_FILE}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

wait_for_healthy() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local elapsed=0
  local container_id
  local status

  printf 'Waiting for %s to become healthy...\n' "${service}"
  while (( elapsed < timeout_seconds )); do
    container_id="$(compose ps -q "${service}")"
    if [[ -n "${container_id}" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "${container_id}")"
      case "${status}" in
        healthy|no-healthcheck)
          printf '%s is %s.\n' "${service}" "${status}"
          return 0
          ;;
        unhealthy)
          compose logs --tail=80 "${service}" >&2 || true
          printf '%s became unhealthy.\n' "${service}" >&2
          return 1
          ;;
      esac
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  compose logs --tail=80 "${service}" >&2 || true
  printf 'Timed out waiting for %s after %ss.\n' "${service}" "${timeout_seconds}" >&2
  return 1
}
