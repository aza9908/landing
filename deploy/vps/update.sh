#!/usr/bin/env bash
# Автодеплой лендинга: новый коммит в main → обновить файлы и перезапустить контейнер.
set -euo pipefail
APP_DIR=/opt/airl-landing
NAME=airl-landing
cd "$APP_DIR"
git fetch -q --depth 1 origin main
old=$(git rev-parse HEAD); new=$(git rev-parse origin/main)
[ "$old" = "$new" ] && exit 0
changed=$(git diff --name-only "$old" "$new" 2>/dev/null || echo "package-lock.json")
git reset -q --hard origin/main
if echo "$changed" | grep -qE '^package(-lock)?\.json$'; then
  docker run --rm -v "$APP_DIR":/app -w /app node:22-alpine npm ci --omit=dev --no-audit --no-fund --loglevel=error
fi
# Сам скрипт тоже обновляется из репозитория.
install -m 755 "$APP_DIR/deploy/vps/update.sh" /usr/local/bin/airl-landing-update
docker restart "$NAME" >/dev/null
echo "deployed $(git log --oneline -1)"
