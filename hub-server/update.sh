#!/usr/bin/env bash
# Обновление серверной части AIRL Hub (скрипт выгрузки данных) одной командой.
# Запускается на сервере AIRL от root. Ключи и пароли не трогает; секретов здесь нет —
# они хранятся только на сервере в /etc/airl-1c-hub/env.
#   BITRIX_WEBHOOK='https://<портал>/rest/1/<ключ>' bash update.sh   — заодно подключить Bitrix24
set -euo pipefail
RAW="${HUB_RAW:-https://raw.githubusercontent.com/aza9908/landing/main/hub-server}"
APP=/opt/airl-1c-hub
ENVF=/etc/airl-1c-hub/env
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
[ -f "$ENVF" ] && [ -d "$APP" ] || { echo "Хаб на этом сервере ещё не установлен"; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$RAW/sync.py" -o "$tmp/sync.py"
curl -fsSL "$RAW/airl-hub" -o "$tmp/airl-hub"
curl -fsSL "$RAW/targetolog.py" -o "$tmp/targetolog.py"
curl -fsSL "$RAW/agents.py" -o "$tmp/agents.py"
python3 -m py_compile "$tmp/sync.py" "$tmp/targetolog.py" "$tmp/agents.py"   # не ставим скрипт, который не запускается
bash -n "$tmp/airl-hub"
cp -a "$APP/sync.py" "$APP/sync.py.bak" 2>/dev/null || true
install -m 755 "$tmp/sync.py" "$APP/sync.py"
install -m 755 "$tmp/airl-hub" /usr/local/bin/airl-hub
install -m 755 "$tmp/targetolog.py" "$APP/targetolog.py"
install -m 755 "$tmp/agents.py" "$APP/agents.py"

# ИИ-таргетолог: библиотека Claude в отдельном окружении и запуск раз в день
if [ ! -x "$APP/venv/bin/python" ]; then
  python3 -m venv "$APP/venv" 2>/dev/null || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv && python3 -m venv "$APP/venv"; }
fi
"$APP/venv/bin/pip" install -q --upgrade anthropic && echo "Библиотека Claude установлена" || echo "!! Не удалось установить библиотеку anthropic — таргетолог не запустится"
grep -qE '^TARGETOLOG_MODE=' "$ENVF" || echo "TARGETOLOG_MODE=advise" >> "$ENVF"
cat > /etc/systemd/system/airl-hub-targetolog.service <<UNIT
[Unit]
Description=AIRL Hub: ИИ-таргетолог
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=airl-hub
EnvironmentFile=$ENVF
ExecStart=$APP/venv/bin/python $APP/targetolog.py
TimeoutStartSec=900
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/airl-1c-hub $APP/web
UNIT
cat > /etc/systemd/system/airl-hub-targetolog.timer <<UNIT
[Unit]
Description=AIRL Hub: ИИ-таргетолог (раз в день)

[Timer]
OnCalendar=*-*-* 09:00:00 Asia/Almaty
Persistent=true

[Install]
WantedBy=timers.target
UNIT

# Команда ИИ-агентов: ежедневная цепочка, почасовые напоминания и постоянно работающий чат
unit() {   # имя, описание, тип запуска, аргумент agents.py
  cat > /etc/systemd/system/airl-hub-agents-$1.service <<UNIT
[Unit]
Description=AIRL Hub: $2
After=network-online.target
Wants=network-online.target

[Service]
$3
User=airl-hub
EnvironmentFile=$ENVF
ExecStart=$APP/venv/bin/python $APP/agents.py $4
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/airl-1c-hub $APP/web
UNIT
}
timer() {  # имя, расписание
  cat > /etc/systemd/system/airl-hub-agents-$1.timer <<UNIT
[Unit]
Description=AIRL Hub: расписание агентов ($1)

[Timer]
OnCalendar=$2
Persistent=true

[Install]
WantedBy=timers.target
UNIT
}
unit daily "ИИ-агенты, ежедневная цепочка" "Type=oneshot
TimeoutStartSec=2400" daily
unit tick "ИИ-агенты, напоминания" "Type=oneshot" tick
unit api "ИИ-агенты, чат хаба" "Restart=always
RestartSec=5" serve
timer daily "*-*-* 08:00:00 Asia/Almaty"
timer tick "*-*-* *:05:00"
printf '\n[Install]\nWantedBy=multi-user.target\n' >> /etc/systemd/system/airl-hub-agents-api.service
install -d -o airl-hub -g airl-hub -m 755 "$APP/web/agents"
if [ "${SKIP_SYSTEMD:-0}" != 1 ]; then
  systemctl daemon-reload
  systemctl enable --now airl-hub-targetolog.timer airl-hub-agents-daily.timer airl-hub-agents-tick.timer >/dev/null
  systemctl enable airl-hub-agents-api.service >/dev/null 2>&1
  systemctl restart airl-hub-agents-api.service
fi
if [ -n "${BITRIX_WEBHOOK:-}" ]; then
  sed -i '/^BITRIX_WEBHOOK=/d' "$ENVF"
  echo "BITRIX_WEBHOOK=$BITRIX_WEBHOOK" >> "$ENVF"
  echo "Вебхук Bitrix24 сохранён"
fi
# Роли: все прежние пользователи становятся руководителями (admin), чтобы никто не потерял доступ.
C=/etc/airl-1c-hub
if [ ! -f "$C/roles" ]; then
  cut -d: -f1 "$C/htpasswd" | sed 's/$/:admin/' > "$C/roles"
fi
airl-hub user rebuild
# nginx: данные 1С (private/) отдаются только руководителям — по отдельному списку паролей
SNIP=/etc/nginx/snippets/airl-1c-hub.conf
cp -a "$SNIP" "$SNIP.bak"
cat > "$SNIP" <<'NGINX'
# AIRL Hub — подключается внутрь блока server { } сайта server.airl.kz.
# Хаб открывается только через https://airl.kz/airl-hub/ (прокси лендинга добавляет
# служебный заголовок); прямой заход по адресу сервера получает 404.
location ^~ /airl-1c-hub/private/ {          # данные 1С и список ролей: только superadmin и admin
    if ($http_x_airl_hub != "landing-proxy") { return 404; }
    alias /opt/airl-1c-hub/web/private/;
    auth_basic "AIRL Hub";
    auth_basic_user_file /etc/airl-1c-hub/htpasswd-admin;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Cache-Control "private, no-store" always;
}
location ^~ /airl-1c-hub/api/ {              # чат с агентами: любой пользователь хаба, имя передаётся службе
    if ($http_x_airl_hub != "landing-proxy") { return 404; }
    auth_basic "AIRL Hub";
    auth_basic_user_file /etc/airl-1c-hub/htpasswd;
    proxy_pass http://127.0.0.1:8787/;
    proxy_set_header X-Hub-User $remote_user;
    proxy_set_header Authorization "";
    proxy_read_timeout 180s;
    client_max_body_size 32k;
    add_header Cache-Control "private, no-store" always;
}
location ^~ /airl-1c-hub/ {                  # всё остальное: любой пользователь хаба
    if ($http_x_airl_hub != "landing-proxy") { return 404; }
    alias /opt/airl-1c-hub/web/;
    index index.html;
    auth_basic "AIRL Hub";
    auth_basic_user_file /etc/airl-1c-hub/htpasswd;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header Cache-Control "private, no-store" always;
}
NGINX
if nginx -t 2>/dev/null; then [ "${SKIP_SYSTEMD:-0}" = 1 ] || systemctl reload nginx; echo "nginx: доступ к данным 1С разделён по ролям"
else cp -a "$SNIP.bak" "$SNIP"; echo "!! nginx -t не прошёл, конфигурация возвращена; роли НЕ включены"; exit 1; fi
# Старый общий файл содержал и данные 1С — убираем его из общего доступа до первой новой выгрузки.
if python3 -c "import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if 'months' in d and 'liabilities' in d else 1)" "$APP/web/data.json" 2>/dev/null; then
  install -o airl-hub -g airl-hub -m 644 "$APP/web/data.json" "$APP/web/private/finance.json"
  rm -f "$APP/web/data.json"
fi
echo "Обновляю данные…"
if [ "${SKIP_SYSTEMD:-0}" = 1 ]; then echo "(проверочный запуск без systemd)"; exit 0; fi
if systemctl start airl-1c-hub-sync; then
  journalctl -u airl-1c-hub-sync -n 8 --no-pager -o cat | tail -6
  echo "Готово: https://airl.kz/airl-hub/"
else
  journalctl -u airl-1c-hub-sync -n 15 --no-pager -o cat
  echo "!! Выгрузка завершилась с ошибкой (см. выше). Прежний скрипт сохранён в $APP/sync.py.bak"; exit 1
fi
