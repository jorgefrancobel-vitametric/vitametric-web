#!/usr/bin/env bash
# vitametric-analytics-watch.sh
# Monitoreo CLI del endpoint analytics de Vitametric.
#
# Uso:
#   bash scripts/local/vitametric-analytics-watch.sh           # ping manual
#   bash scripts/local/vitametric-analytics-watch.sh --watch    # cada 10s
#   bash scripts/local/vitametric-analytics-watch.sh --tail     # logs de Cloudflare
#
# Requisitos: curl, jq (opcional, para pretty-print)

set -euo pipefail

ENDPOINT="${VITAMETRIC_ANALYTICS_URL:-https://vitametric.com/api/analytics}"
INTERVAL="${VITAMETRIC_WATCH_INTERVAL:-10}"

# ── Healthcheck ──

healthcheck() {
  local ts
  ts=$(date +%s)
  local resp
  resp=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Origin: https://vitametric.com" \
    -d "{\"event\":\"healthcheck\",\"sessionId\":\"cli_${ts}\",\"timestamp\":${ts}}" 2>&1)

  local http_code
  http_code=$(echo "$resp" | tail -1)
  local body
  body=$(echo "$resp" | sed '$d')

  local now
  now=$(date '+%H:%M:%S')

  if [[ "$http_code" == "200" ]]; then
    echo -e "[$now] 🟢 $http_code — endpoint vivo"
    if command -v jq &>/dev/null; then
      echo "$body" | jq . 2>/dev/null || echo "$body"
    else
      echo "    $body"
    fi
  elif [[ "$http_code" == "405" ]]; then
    echo -e "[$now] 🟡 $http_code — build pendiente (Pages Functions no desplegado aún)"
  elif [[ "$http_code" == "404" ]]; then
    echo -e "[$now] 🔴 $http_code — endpoint no encontrado"
    echo "    Revisá que functions/api/analytics.js esté en el repo y Pages haya desplegado."
  else
    echo -e "[$now] 🔴 $http_code — error"
    echo "    $body"
  fi
}

# ── Watch loop ──

watch_loop() {
  echo "🔍 Monitoreando $ENDPOINT cada ${INTERVAL}s (Ctrl+C para salir)..."
  echo ""
  while true; do
    healthcheck
    sleep "$INTERVAL"
  done
}

# ── Tail logs (Cloudflare Pages) ──

tail_logs() {
  echo "📋 Conectando a logs de Cloudflare Pages..."
  echo "   (requiere wrangler configurado con acceso al proyecto vitametric-web)"
  echo ""
  npx wrangler pages deployment tail --project-name vitametric-web 2>&1
}

# ── Quick stats (últimos eventos desde el endpoint) ──

quick_stats() {
  local resp
  resp=$(curl -s -X GET "$ENDPOINT" \
    -H "Origin: https://vitametric.com" 2>&1)

  if [[ "$resp" == *"vitametric-analytics"* ]]; then
    echo "📊 Analytics endpoint: ONLINE"
    echo "   GET $ENDPOINT → $resp"
  else
    echo "📊 Analytics endpoint: no disponible por GET"
  fi

  # Verificar último despliegue de Pages
  echo ""
  echo "📦 Último commit desplegado:"
  cd "$(git rev-parse --show-toplevel 2>/dev/null || echo '/Users/jorgefrancolara/Documents/vitametric-web')"
  echo "   $(git log --oneline -1)"
}

# ── Main ──

case "${1:-}" in
  --watch|-w)
    watch_loop
    ;;
  --tail|-t)
    tail_logs
    ;;
  --stats|-s)
    quick_stats
    ;;
  *)
    healthcheck
    ;;
esac