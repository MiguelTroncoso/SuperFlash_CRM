#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/common.sh"

if ! command -v curl >/dev/null 2>&1; then
  printf 'curl is required to run production health checks.\n' >&2
  exit 1
fi

check_http() {
  local name="$1"
  local url="$2"
  local minimum_status="$3"
  local status

  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 10 "${url}")"
  if (( status < minimum_status || status >= 500 )); then
    printf '%s health check failed: HTTP %s (%s)\n' "${name}" "${status}" "${url}" >&2
    return 1
  fi
  printf '%s health check passed: HTTP %s.\n' "${name}" "${status}"
}

wait_for_healthy postgres
wait_for_healthy redis
wait_for_healthy api
wait_for_healthy web

compose exec -T api node apps/api/dist/prisma/verify-production.js

check_http API http://127.0.0.1:3001/api/v1/auth/me 400
check_http Web http://127.0.0.1:3000/ 200
check_http PublicAPI "$(env_value NEXT_PUBLIC_API_URL)/api/v1/auth/me" 400
check_http PublicWeb "$(env_value WEB_URL)/" 200

printf 'All production health checks passed.\n'
