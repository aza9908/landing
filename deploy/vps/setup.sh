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
DATA_DIR=/var/lib/airl-landing     # база заявок (SQLite), файлы агентов, бэкапы
ENV_FILE=/etc/airl-landing.env     # ключи; в git не попадает

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
# Данные и ключи живут вне репозитория и вне контейнера.
install -d -m 750 -o 1000 -g 1000 "$DATA_DIR"
if [ ! -f "$ENV_FILE" ]; then
  install -m 600 /dev/null "$ENV_FILE"
  echo "# airl.kz landing: keys for the API (api/). One NAME=value per line, no quotes." > "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
# Ключ Anthropic для ИИ-агентов панели скрипт сам ниоткуда не берёт: его добавляет
# владелец строкой ANTHROPIC_API_KEY=... в этот файл. Без ключа работает всё,
# кроме агентов «Портрет боли», «Урок 1» и чат-анкеты.
grep -qE '^ANTHROPIC_API_KEY=.{20,}' "$ENV_FILE" || echo "anthropic key: not set yet (AI agents of the panel are off until it is added to $ENV_FILE)"
echo "env file holds: $(grep -oE '^[A-Z_]+=' "$ENV_FILE" | tr -d '=' | tr '\n' ' ')"

if docker inspect "$NAME" >/dev/null 2>&1; then docker rm -f "$NAME" >/dev/null; fi
say "start container $NAME on 127.0.0.1:$PORT"
docker run -d --name "$NAME" --restart unless-stopped \
  -p "127.0.0.1:$PORT:8080" -e NODE_ENV=production -e PORT=8080 \
  -e AIRL_DATA_DIR=/data \
  -e "NODE_OPTIONS=--disable-warning=ExperimentalWarning --dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=5000" \
  --env-file "$ENV_FILE" \
  -v "$APP_DIR":/app:ro -v "$DATA_DIR":/data -w /app \
  --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges \
  --memory 768m --log-opt max-size=10m --log-opt max-file=3 \
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
NAMES="airl.kz www.airl.kz online.airl.kz"
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
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }'
# LMS (репозиторий aza9908/CRM-vibecoding) работает на этом же сервере: страницы —
# контейнер lms-web-1 (127.0.0.1:3001, путь /lms), API и сокеты — lms-api-1
# (127.0.0.1:3002), файлы уроков — MinIO (127.0.0.1:9000, бакет lms-storage).
# Отдаём их под airl.kz напрямую, чтобы LMS не зависела от адресов
# lms.magauin.kz и lms-api.magauin.kz:
#   https://airl.kz/lms/…          страницы
#   https://airl.kz/lms-api/…      API (префикс срезается: API видит те же пути, что и раньше)
#   https://airl.kz/lms-storage/…  файлы; путь без изменений — он входит в подпись ссылок MinIO
# Лимиты запросов те же, что у прежнего адреса API (зоны из conf.d/lms-hardening.conf).
LMS=""
if docker inspect lms-web-1 >/dev/null 2>&1 && docker inspect lms-api-1 >/dev/null 2>&1; then
  LIMITS=""
  if grep -qs 'zone=lms_api_req' /etc/nginx/conf.d/lms-hardening.conf; then
    LIMITS='
        limit_req zone=lms_api_req burst=1500 nodelay;
        limit_conn lms_api_conn 600;'
  fi
  LMS='
    location ^~ /lms {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade_airl;
        proxy_buffering off;
    }
    location ^~ /lms-api/ {'"$LIMITS"'
        proxy_pass http://127.0.0.1:3002/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade_airl;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
    location ^~ /lms-storage/ {'"$LIMITS"'
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 60m;
    }'
  echo "LMS found on this server: /lms, /lms-api/ and /lms-storage/ are served under airl.kz"
fi
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
    # $host, а не airl.kz: http://online.airl.kz должен попасть на https://online.airl.kz
    echo '    location / { return 301 https://$host$request_uri; }'
    echo "}"
    echo "server {"
    # [::]:443 без http2 — как у остальных сайтов сервера: опции сокета общие на всех.
    echo "    listen 443 ssl http2; listen [::]:443 ssl;"
    echo "    server_name $NAMES;"
    echo "    client_max_body_size 25m;"
    echo "    ssl_certificate $CERT;"
    echo "    ssl_certificate_key /etc/letsencrypt/live/airl.kz/privkey.pem;"
    [ -f /etc/letsencrypt/options-ssl-nginx.conf ] && echo "    include /etc/letsencrypt/options-ssl-nginx.conf;"
    echo '    if ($host = www.airl.kz) { return 301 https://airl.kz$request_uri; }'
  fi
  echo "$LMS"
  echo "$PROXY"
  echo "}"
} > "$SITE.new"
[ -f "$SITE" ] && cp "$SITE" "$SITE.prev"
mv "$SITE.new" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/airl.kz
say "nginx -t"
if ! nginx -t 2>&1; then
  # Рабочий сайт не трогаем: возвращаем прежний конфиг (или убираем новый, если прежнего не было).
  if [ -f "$SITE.prev" ]; then cp "$SITE.prev" "$SITE"; echo "nginx config invalid — previous config restored, nothing reloaded"
  else rm -f /etc/nginx/sites-enabled/airl.kz; echo "nginx config invalid — site not enabled, nothing reloaded"; fi
  exit 1
fi
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
cat > /etc/systemd/system/airl-landing-backup.service <<UNIT
[Unit]
Description=Nightly copy of the airl.kz landing database ($DATA_DIR/backups, last 14 kept)
After=docker.service
[Service]
Type=oneshot
ExecStart=/usr/bin/docker exec $NAME node api/backup.js
UNIT
cat > /etc/systemd/system/airl-landing-backup.timer <<UNIT
[Unit]
Description=Nightly backup of the airl.kz landing database
[Timer]
OnCalendar=*-*-* 03:17:00
Persistent=true
[Install]
WantedBy=timers.target
UNIT
# Сертификат сам расширяется на поддомены (www, online), когда их DNS начинает
# указывать на этот сервер: проверка раз в 10 минут, выпуск не чаще раза в час.
install -m 755 "$APP_DIR/deploy/vps/cert-watch.sh" /usr/local/bin/airl-landing-cert-watch
install -m 755 "$APP_DIR/deploy/vps/enable-https.sh" /usr/local/bin/airl-landing-enable-https
cat > /etc/systemd/system/airl-landing-cert.service <<UNIT
[Unit]
Description=Add airl.kz subdomains to the certificate once their DNS points here
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/airl-landing-cert-watch
UNIT
cat > /etc/systemd/system/airl-landing-cert.timer <<UNIT
[Unit]
Description=Watch DNS of airl.kz subdomains for the certificate
[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now airl-landing-update.timer airl-landing-backup.timer airl-landing-cert.timer >/dev/null 2>&1
say "auto-deploy timer: $(systemctl is-active airl-landing-update.timer) · backup timer: $(systemctl is-active airl-landing-backup.timer)"
say "API: $(curl -s --max-time 10 "http://127.0.0.1:$PORT/api/health")"
