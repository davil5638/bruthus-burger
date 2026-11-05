#!/usr/bin/env bash
# Registra o webhook do atendente no OlaClick.
#
# Existe como arquivo por um motivo pratico: o comando equivalente digitado
# no PowerShell perde as aspas duplas no caminho ate o ssh, e o curl acaba
# recebendo "-H x-api-key:" sem valor — 401. Aqui o shell e bash do comeco
# ao fim, entao nao ha reescrita de aspas.
#
# O token e o segredo saem do .env da propria VM: nada sensivel trafega.
set -euo pipefail

cd /home/ubuntu/evolution
set -a; . ./.env; set +a

: "${OLACLICK_API_TOKEN:?token ausente no .env}"
: "${DOMINIO:?dominio ausente no .env}"
: "${HOOK_SEGREDO:?segredo ausente no .env}"

API=https://public-api.olaclick.app/v1
URL="https://${DOMINIO}/hooks/olaclick/${HOOK_SEGREDO}"

echo "== webhooks ANTES =="
curl -s -m 20 "$API/webhooks" -H "x-api-key: $OLACLICK_API_TOKEN" \
  | grep -oE '"webhook_url":"[^"]*"' | sed -E 's|(/hooks/olaclick/)[^"]*|\1<oculto>|'

echo
echo "== registrando =="
RESP=$(curl -s -m 25 -X POST "$API/webhooks" \
  -H "x-api-key: $OLACLICK_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"webhook_url\":\"$URL\",\"merchant_id\":\"bruthus-atendente\",\"event_types\":[\"ORDER_CREATED\",\"ORDER_UPDATED\"],\"max_retry\":5}")
echo "$RESP" | sed -E 's|(/hooks/olaclick/)[^"]*|\1<oculto>|' | head -c 300

echo
echo
echo "== webhooks DEPOIS (os DOIS precisam estar aqui) =="
curl -s -m 20 "$API/webhooks" -H "x-api-key: $OLACLICK_API_TOKEN" \
  | sed -E 's|(/hooks/olaclick/)[^"]*|\1<oculto>|' \
  | grep -oE '"webhook_url":"[^"]*"|"is_active":[a-z]+'
