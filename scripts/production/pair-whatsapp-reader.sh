#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
READER_SERVICE="whatsapp-reader"

cleanup() {
  printf '\nPairing detenido. La sesión existente no fue eliminada.\n'
}
trap cleanup INT TERM EXIT

docker compose -f "$COMPOSE_FILE" ps --status running api redis "$READER_SERVICE" >/dev/null
curl --silent --show-error --connect-timeout 5 http://127.0.0.1:3001/api/v1/auth/login >/dev/null || {
  printf 'API no disponible en localhost:3001.\n' >&2
  exit 1
}

docker compose -f "$COMPOSE_FILE" exec -T "$READER_SERVICE" sh -c 'wget --quiet --post-data="" --header="Authorization: Bearer ${WHATSAPP_READER_SERVICE_TOKEN:?WHATSAPP_READER_SERVICE_TOKEN es obligatorio}" -O - http://127.0.0.1:3010/pair' >/dev/null
printf 'Esperando escaneo del QR. El código se mostrará en esta terminal y en el panel del CRM.\n'
printf 'Ctrl+C cancela la espera sin desvincular una sesión existente.\n\n'
docker compose -f "$COMPOSE_FILE" logs --follow --tail=100 "$READER_SERVICE"
