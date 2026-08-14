#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/common.sh"

cd "${APP_DIR}"

required_variables=(
  NODE_ENV POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL REDIS_URL
  WEB_URL NEXT_PUBLIC_API_URL JWT_ACCESS_SECRET JWT_ACCESS_TTL_SECONDS
  REFRESH_TOKEN_TTL_DAYS COOKIE_SECURE SWAGGER_ENABLED DEFAULT_TIMEZONE
  CREDENTIAL_ENCRYPTION_KEY SEED_CATALOG_EXAMPLES
  WHATSAPP_GRAPH_API_VERSION WHATSAPP_WEBHOOK_PUBLIC_URL
)

validate_configuration() {
  local variable secret_value

  for variable in "${required_variables[@]}"; do
    require_env "${variable}"
  done

  if [[ "$(env_value NODE_ENV)" != "production" ]]; then
    printf 'NODE_ENV must be production.\n' >&2
    return 1
  fi

  if [[ "$(env_value COOKIE_SECURE)" != "true" ]]; then
    printf 'COOKIE_SECURE must be true in production.\n' >&2
    return 1
  fi

  if [[ "$(env_value SWAGGER_ENABLED)" != "false" ]]; then
    printf 'SWAGGER_ENABLED must be false in production.\n' >&2
    return 1
  fi

  for variable in JWT_ACCESS_SECRET CREDENTIAL_ENCRYPTION_KEY POSTGRES_PASSWORD; do
    secret_value="$(env_value "${variable}")"
    if (( ${#secret_value} < 32 )) || [[ "${secret_value}" == *replace-with* ]] || [[ "${secret_value}" == *change-me* ]]; then
      printf '%s must be a unique production secret with at least 32 characters.\n' "${variable}" >&2
      return 1
    fi
  done

  compose config --quiet
}

if [[ "${1:-}" == "--validate" ]]; then
  validate_configuration
  printf 'Production deployment configuration is valid.\n'
  exit 0
fi

validate_configuration

previous_sha="$(git rev-parse HEAD)"
target_sha="${previous_sha}"
rollback_running=0

rollback_on_failure() {
  local failure_status="$?"
  local rollback_status
  trap - ERR

  if (( rollback_running == 1 )) || [[ "${target_sha}" == "${previous_sha}" ]]; then
    exit "${failure_status}"
  fi

  rollback_running=1
  printf 'Deployment failed at %s. Rolling application code back to %s.\n' "${target_sha}" "${previous_sha}" >&2
  set +e
  git checkout main
  git reset --hard "${previous_sha}"
  compose build --pull api web
  compose up -d postgres redis
  wait_for_healthy postgres
  wait_for_healthy redis
  compose up -d api web
  wait_for_healthy api
  wait_for_healthy web
  PRODUCTION_ENV_FILE="${ENV_FILE}" "${SCRIPT_DIR}/healthcheck.sh"
  rollback_status=$?
  set -e

  if (( rollback_status != 0 )); then
    printf 'Automatic application rollback could not be verified. Manual intervention is required.\n' >&2
  else
    printf 'Application rollback verified. Database migrations are forward-only and were not rolled back.\n' >&2
  fi
  exit "${failure_status}"
}

trap rollback_on_failure ERR

printf 'Creating pre-deployment PostgreSQL backup...\n'
compose up -d postgres redis
wait_for_healthy postgres
wait_for_healthy redis
PRODUCTION_ENV_FILE="${ENV_FILE}" "${SCRIPT_DIR}/backup-postgres.sh"

printf 'Synchronizing the VPS checkout with origin/main...\n'
git fetch origin main --tags
git checkout main
git pull --ff-only origin main
target_sha="$(git rev-parse HEAD)"

printf 'Validating production Compose configuration...\n'
compose config --quiet

printf 'Pulling external base images...\n'
compose pull postgres redis

printf 'Building production images...\n'
compose build --pull api web

printf 'Applying Prisma migrations...\n'
compose run --rm --no-deps api npm run prisma:migrate:deploy --workspace=@superflash/api

printf 'Running the compiled, production-safe seed...\n'
compose run --rm --no-deps api npm run prisma:seed:prod --workspace=@superflash/api

printf 'Verifying production seed integrity...\n'
compose run --rm --no-deps api npm run prisma:verify:prod --workspace=@superflash/api

printf 'Starting API and Web...\n'
compose up -d api web
wait_for_healthy api
wait_for_healthy web

printf 'Running final HTTP and data health checks...\n'
PRODUCTION_ENV_FILE="${ENV_FILE}" "${SCRIPT_DIR}/healthcheck.sh"

trap - ERR
printf 'Production deployment completed successfully at %s.\n' "${target_sha}"
