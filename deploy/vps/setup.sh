#!/usr/bin/env bash
# Установка лендинга airl.kz на VPS. Идемпотентно: повторный запуск безопасен.
set -euo pipefail

APP_DIR=/opt/airl-landing
REPO=https://github.com/aza9908/landing.git
NAME=airl-landing
PORT=3160
IMAGE=node:22-alpine
SITE=/etc/nginx/sites-available/airl.kz
WEBROOT=/var/www/certbot

say() { echo "== $*"; }

# 1. Порт не должен быть занят чужим процессом.
if ss -ltn "sport = :$PORT" | grep -q LISTEN && ! docker ps --format '{{.Names}} {{.Ports}}' | grep -q "^$NAME .*:$PORT->"; then
  echo "Port $PORT is taken by something else:"; ss -ltnp "sport = :$PORT"; exit 1
fi

# 2. Код.
if [ -d "$APP_DIR/.git" ]; then
  say "update $APP_DIR"
  git -C "$APP_DIR" fetch -q --depth 1 origin main
  git -C "$APP_DIR" reset -q --hard origin/main
else
  say "clone $REPO → $APP_DIR"
  git clone -q --depth 1 "$REPO" "$APP_DIR"
fi
git -C "$APP_DIR" log --oneline -1

# 3. Зависимости и контейнер.
say "npm ci"
docker run --rm -v "$APP_DIR":/app -w /app "$IMAGE" npm ci --omit=dev --no-audit --no-fund --loglevel=error
if docker inspect "$NAME" >/dev/null 2>&1; then docker rm -f "$NAME" >/dev/null; fi
say "start container $NAME on 127.0.0.1:$PORT"
docker run -d --name "$NAME" --restart unless-stopped \
  -p "127.0.0.1:$PORT:8080" -e NODE_ENV=production -e PORT=8080 \
  -v "$APP_DIR":/app:ro -w /app \
  --memory 512m --log-opt max-size=10m --log-opt max-file=3 \
  "$IMAGE" node server.js >/dev/null
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
  [ "$code" = 200 ] && break; sleep 1
done
echo "container answers: HTTP $code"; [ "$code" = 200 ]

# 4. nginx. Если сертификат уже есть — сайт сразу с HTTPS, иначе только HTTP + ACME.
mkdir -p "$WEBROOT"
if grep -rlsE "server_name([[:space:]]+[^;[:space:]]+)*[[:space:]]+(www\.)?airl\.kz([[:space:]]|;)" /etc/nginx/sites-enabled /etc/nginx/conf.d | grep -v "/airl.kz$"; then
  echo "Another nginx site already claims airl.kz (listed above) — refusing to continue."; exit 1
fi
NAMES="airl.kz"
getent ahostsv4 www.airl.kz >/dev/null && NAMES="airl.kz www.airl.kz"
PROXY='
    location /.well-known/acme-challenge/ { root '"$WEBROOT"'; }
    location / {
        proxy_pass http://127.0.0.1:'"$PORT"';
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade_airl;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }'
CERT=/etc/letsencrypt/live/airl.kz/fullchain.pem
{
  echo "# Managed by landing/deploy/vps/setup.sh — edits are overwritten."
  echo 'map $http_upgrade $connection_upgrade_airl { default upgrade; "" close; }'
  echo "server {"
  echo "    listen 80; listen [::]:80;"
  echo "    server_name $NAMES;"
  echo "    client_max_body_size 25m;"
  if [ -f "$CERT" ]; then
    echo '    location /.well-known/acme-challenge/ { root '"$WEBROOT"'; }'
    echo '    location / { return 301 https://airl.kz$request_uri; }'
    echo "}"
    echo "server {"
    echo "    listen 443 ssl http2; listen [::]:443 ssl http2;"
    echo "    server_name $NAMES;"
    echo "    client_max_body_size 25m;"
    echo "    ssl_certificate $CERT;"
    echo "    ssl_certificate_key /etc/letsencrypt/live/airl.kz/privkey.pem;"
    [ -f /etc/letsencrypt/options-ssl-nginx.conf ] && echo "    include /etc/letsencrypt/options-ssl-nginx.conf;"
    echo '    if ($host = www.airl.kz) { return 301 https://airl.kz$request_uri; }'
  fi
  echo "$PROXY"
  echo "}"
} > "$SITE.new"
mv "$SITE.new" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/airl.kz
say "nginx -t"
if ! nginx -t 2>&1; then rm -f /etc/nginx/sites-enabled/airl.kz; echo "nginx config invalid — site disabled, nothing reloaded"; exit 1; fi
systemctl reload nginx
echo "nginx site: $NAMES $( [ -f "$CERT" ] && echo '(HTTPS)' || echo '(HTTP only until enable-https.sh)')"

# 5. Автодеплой.
install -m 755 "$APP_DIR/deploy/vps/update.sh" /usr/local/bin/airl-landing-update
cat > /etc/systemd/system/airl-landing-update.service <<UNIT
[Unit]
Description=Pull aza9908/landing main and restart airl-landing if it changed
After=network-online.target docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/bin/airl-landing-update
UNIT
cat > /etc/systemd/system/airl-landing-update.timer <<UNIT
[Unit]
Description=Auto-deploy airl.kz landing every minute
[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now airl-landing-update.timer >/dev/null 2>&1
say "auto-deploy timer: $(systemctl is-active airl-landing-update.timer)"
