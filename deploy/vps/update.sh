#!/usr/bin/env bash
# Автодеплой лендинга: новый коммит в main → обновить файлы и, если изменился сервер, перезапустить контейнер.
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
# Этот скрипт (он работает от root) из репозитория сам себя не обновляет:
# новую версию ставит только setup.sh, который запускают вручную.
# Страницы, картинки и скрипты для браузера сервер читает с диска при каждом запросе,
# поэтому перезапуск (секунда-две недоступности) нужен, только если изменился сам сервер.
if echo "$changed" | grep -qE '^(server\.js|hub-login\.html|package(-lock)?\.json|api/|functions/|hub-app/)'; then
  docker restart "$NAME" >/dev/null
  echo "deployed $(git log --oneline -1) (site restarted)"
else
  echo "deployed $(git log --oneline -1) (static files only, no restart)"
fi
