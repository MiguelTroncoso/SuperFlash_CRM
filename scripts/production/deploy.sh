#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/common.sh"

cd "${APP_DIR}"

for variable in \
  NODE_ENV POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL REDIS_URL \
  WEB_URL NEXT_PUBLIC_API_URL JWT_ACCESS_SECRET JWT_ACCESS_TTL_SECONDS \
  REFRESH_TOKEN_TTL_DAYS COOKIE_SECURE SWAGGER_ENABLED DEFAULT_TIMEZONE \
  CREDENTIAL_ENCRYPTION_KEY SEED_OWNER_EMAIL SEED_OWNER_PASSWORD \
  SEED_OWNER_FIRST_NAME SEED_OWNER_LAST_NAME SEED_CATALOG_EXAMPLES; do
  require_env "${variable}"
done

if [[ "$(env_value NODE_ENV)" != "production" ]]; then
  printf 'NODE_ENV must be production.\n' >&2
  exit 1
fi

if [[ "$(env_value COOKIE_SECURE)" != "true" ]]; then
  printf 'COOKIE_SECURE must be true in production.\n' >&2
  exit 1
fi

if [[ "$(env_value SWAGGER_ENABLED)" != "false" ]]; then
  printf 'SWAGGER_ENABLED must be false in production.\n' >&2
  exit 1
fi

for secret_name in JWT_ACCESS_SECRET CREDENTIAL_ENCRYPTION_KEY; do
  secret_value="$(env_value "${secret_name}")"
  if (( ${#secret_value} < 32 )) || [[ "${secret_value}" == *replace-with* ]] || [[ "${secret_value}" == *change-me* ]]; then
    printf '%s must be a unique production secret with at least 32 characters.\n' "${secret_name}" >&2
    exit 1
  fi
done

printf 'Validating production Compose configuration...\n'
compose config --quiet

printf 'Pulling external base images...\n'
compose pull postgres redis

printf 'Building production images...\n'
compose build --pull api web

printf 'Starting PostgreSQL and Redis...\n'
compose up -d postgres redis
wait_for_healthy postgres
wait_for_healthy redis

printf 'Applying Prisma migrations...\n'
compose run --rm --no-deps api npm run prisma:migrate:deploy --workspace=@superflash/api

printf 'Starting API...\n'
compose up -d api
wait_for_healthy api

printf 'Starting Web...\n'
compose up -d web
wait_for_healthy web

printf 'Running final HTTP health checks...\n'
PRODUCTION_ENV_FILE="${ENV_FILE}" "${SCRIPT_DIR}/healthcheck.sh"

printf 'Production deployment completed successfully.\n'
