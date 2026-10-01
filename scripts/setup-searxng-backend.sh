#!/usr/bin/env bash
#
# Gateway SearXNG backend bootstrap (USER_DOCS/08_WEB_SEARCH_BACKEND_RUNBOOK.md).
#
# Points the SAP MCP gateway's `web_search` / `web_extract` tools at a
# self-hosted SearXNG running on the same box (the engines' rate limits depend
# on the egress IP, so the backend must live where the gateway lives).
#
# What it does, in order, and it stays idempotent: every step is safe to re-run.
#   1. Copies the settings file (datacenter-IP engines: bing / yep / yahoo,
#      JSON API enabled, limiter off) into the SearXNG config directory.
#   2. Renders a minimal docker-compose.yml unless one already exists there.
#   3. Brings the container up (force-recreate, so a settings change is re-read).
#   4. Runs the canary WITH the assertion the runbook mandates: the JSON API must
#      answer with results — a 200 carrying `results: []` is a FAIL, not a pass.
#   5. Checks that SAP_MCP_SEARXNG_URL is present in the gateway env file.
#   6. Reminds the one thing this script cannot do: restart the gateway process.
#
# Usage:  sudo ./setup-searxng-backend.sh [env-file]
# Env:    SEARXNG_DIR (default /opt/searxng), GATEWAY_ENV_FILE (default arg 1 or
#         /home/sapgateway/sap-mcp-private/sap-mcp.env)

set -euo pipefail

SEARXNG_DIR="${SEARXNG_DIR:-/opt/searxng}"
GATEWAY_ENV_FILE="${2:-${GATEWAY_ENV_FILE:-/home/sapgateway/sap-mcp-private/sap-mcp.env}}"
COMPOSE_PROJECT="sap-searxng"

settings_src="$(cd "$(dirname "$0")" && pwd)/searxng/settings.yml"

log()  { printf '\n==> %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker is not installed on this host"
docker info --format 'docker up' >/dev/null || fail "docker daemon is not running"

# ─── 1. settings.yml ─────────────────────────────────────────────────────────
log "1/6 SearXNG settings -> ${SEARXNG_DIR}"
mkdir -p "${SEARXNG_DIR}/searxng"
cp "${settings_src}" "${SEARXNG_DIR}/searxng/settings.yml"

# ─── 2. compose file (only when absent; operator edits win over this script) ─
if [ ! -f "${SEARXNG_DIR}/docker-compose.yml" ]; then
  log "2/6 writing ${SEARXNG_DIR}/docker-compose.yml (runbook compose)"
  cat > "${SEARXNG_DIR}/docker-compose.yml" <<'YAML'
services:
  searxng:
    image: searxng/searxng:latest
    container_name: sap-gateway-searxng
    restart: unless-stopped
    ports:
      - "127.0.0.1:8888:8080"
    environment:
      - SEARXNG_BASE_URL=http://127.0.0.1:8888/
    volumes:
      - ./searxng/settings.yml:/etc/searxng/settings.yml:ro
YAML
else
  log "2/6 compose file already present, left untouched"
fi

# ─── 3. up (force-recreate re-reads settings) ────────────────────────────────
log "3/6 docker compose up -d --force-recreate searxng"
( cd "${SEARXNG_DIR}" && docker compose -p "${COMPOSE_PROJECT}" up -d --force-recreate searxng )
sleep 8
docker ps --filter "name=sap-gateway-searxng" --format '{{.Names}} {{.Status}}' | grep -q searxng \
  || fail "searxng container is not up"

# ─── 4. canary WITH the results assertion ────────────────────────────────────
log "4/6 canary: JSON API must answer with results, five distinct queries"
for i in 1 2 3 4 5; do
  curl -fsS "http://127.0.0.1:8888/search?q=sap+mcp+canary+${i}&format=json" \
    | jq -e '.results | length > 0' > /dev/null \
    || fail "canary run ${i} returned no results — check http://127.0.0.1:8888/stats, docker logs, the engines list in settings.yml ( Suspended / CAPTCHA ), before blaming the query"
done
log "canary green: 5/5 runs returned results"

# ─── 5. gateway env wiring ───────────────────────────────────────────────────
log "5/6 gateway env: SAP_MCP_SEARXNG_URL in ${GATEWAY_ENV_FILE}"
if [ ! -f "${GATEWAY_ENV_FILE}" ]; then
  echo "NOTE: gateway env file not found at ${GATEWAY_ENV_FILE}; set the variable where your gateway reads it:" >&2
  echo "      SAP_MCP_SEARXNG_URL=http://127.0.0.1:8888" >&2
elif grep -q '^SAP_MCP_SEARXNG_URL=' "${GATEWAY_ENV_FILE}"; then
  current="$(grep '^SAP_MCP_SEARXNG_URL=' "${GATEWAY_ENV_FILE}" | head -1 | cut -d= -f2-)"
  log "already set: ${current}"
  [ "${current}" = "http://127.0.0.1:8888" ] || echo "NOTE: value differs from the runbook default http://127.0.0.1:8888 — keeping yours." >&2
else
  printf '\n# Web search backend (USER_DOCS/08_WEB_SEARCH_BACKEND_RUNBOOK.md)\nSAP_MCP_SEARXNG_URL=http://127.0.0.1:8888\n' >> "${GATEWAY_ENV_FILE}"
  log "appended SAP_MCP_SEARXNG_URL=http://127.0.0.1:8888"
fi

# ─── 6. the one manual step left ─────────────────────────────────────────────
log "6/6 remaining manual step"
echo "  Restart the gateway process so it re-reads the env (this script cannot" >&2
echo "  know how your gateway is supervised):" >&2
echo "    pm2 restart sap-mcp --update-env   # or your supervisor's equivalent" >&2
echo "  Then verify from the gateway host:" >&2
echo "    docker logs sap-gateway-searxng --tail=20" >&2
echo "  And end-to-end: tools/call web_search on the gateway must return results." >&2
log "done — SearXNG backend is up and wired"