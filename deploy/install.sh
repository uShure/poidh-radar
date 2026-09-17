#!/usr/bin/env bash
# Install poidh-radar as a cron job on a server that has Docker but no Node.
#
#   bash deploy/install.sh <telegram-bot-token> <telegram-chat-id> [minutes]
#
# Idempotent: re-running updates the credentials and leaves a single cron entry.

set -euo pipefail

TOKEN="${1:-}"
CHAT="${2:-}"
EVERY="${3:-20}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="/etc/poidh-radar.env"
LOG_FILE="/var/log/poidh-radar.log"
IMAGE="node:22-alpine"

if [ -z "$TOKEN" ] || [ -z "$CHAT" ]; then
  echo "usage: bash deploy/install.sh <telegram-bot-token> <telegram-chat-id> [minutes]" >&2
  exit 2
fi

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }

# The state path is the path *inside* the container: /app is the mounted
# checkout, so the file survives; a host path would be written into the
# container's own filesystem and vanish with --rm.
printf 'POIDH_RADAR_TG_TOKEN=%s\nPOIDH_RADAR_TG_CHAT=%s\nPOIDH_RADAR_STATE=%s\n' \
  "$TOKEN" "$CHAT" "/app/state.json" > "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "wrote $ENV_FILE (mode 600)"

CRON_CMD="docker run --rm --env-file $ENV_FILE -v $APP_DIR:/app -w /app $IMAGE node bin/radar.js >> $LOG_FILE 2>&1"
CRON_LINE="*/$EVERY * * * * root $CRON_CMD"

# Drop any previous entry before adding the current one.
if [ -f /etc/crontab ]; then
  grep -v 'poidh-radar' /etc/crontab > /etc/crontab.tmp || true
  mv /etc/crontab.tmp /etc/crontab
fi
echo "$CRON_LINE" >> /etc/crontab
echo "cron: every $EVERY minutes"

touch "$LOG_FILE"
docker pull -q "$IMAGE" >/dev/null
echo "first run:"
docker run --rm --env-file "$ENV_FILE" -v "$APP_DIR:/app" -w /app "$IMAGE" node bin/radar.js
echo "done — logs go to $LOG_FILE"
