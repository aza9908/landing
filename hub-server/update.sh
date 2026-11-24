#!/usr/bin/env bash
# Обновление серверной части AIRL Hub (скрипт выгрузки данных) одной командой.
# Запускается на сервере AIRL от root. Ключи и пароли не трогает; секретов здесь нет —
# они хранятся только на сервере в /etc/airl-1c-hub/env.
#   BITRIX_WEBHOOK='https://<портал>/rest/1/<ключ>' bash update.sh   — заодно подключить Bitrix24
set -euo pipefail
trap 'echo "!! Обновление прервалось на строке $LINENO — пришлите этот вывод"' ERR
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
curl -fsSL "$RAW/users.py" -o "$tmp/users.py"
python3 -m py_compile "$tmp/sync.py" "$tmp/targetolog.py" "$tmp/agents.py" "$tmp/users.py"   # не ставим скрипт, который не запускается
bash -n "$tmp/airl-hub"
cp -a "$APP/sync.py" "$APP/sync.py.bak" 2>/dev/null || true
install -m 755 "$tmp/sync.py" "$APP/sync.py"
install -m 755 "$tmp/airl-hub" /usr/local/bin/airl-hub
install -m 755 "$tmp/targetolog.py" "$APP/targetolog.py"
install -m 755 "$tmp/agents.py" "$APP/agents.py"
install -m 755 "$tmp/users.py" "$APP/users.py"

# ИИ-таргетолог: библиотека Claude в отдельном окружении и запуск раз в день
if [ ! -x "$APP/venv/bin/python" ]; then
  python3 -m venv "$APP/venv" 2>/dev/null || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv && python3 -m venv "$APP/venv"; }
fi
# отчёты в PDF: библиотека вёрстки, её системные зависимости, логотип и шрифт
if ! python3 -c "import ctypes.util,sys; sys.exit(0 if ctypes.util.find_library('pango-1.0') else 1)" 2>/dev/null; then
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 >/dev/null || echo "!! Не удалось установить библиотеки для PDF"
fi
mkdir -p "$APP/pdf"
for f in airl-logo.png NunitoSans-400.ttf NunitoSans-600.ttf NunitoSans-700.ttf NunitoSans-800.ttf; do
  curl -fsSL "$RAW/pdf/$f" -o "$APP/pdf/$f" || echo "!! Не скачался файл оформления PDF: $f"
done
"$APP/venv/bin/pip" install -q --upgrade anthropic && echo "Библиотека Claude установлена" || echo "!! Не удалось установить библиотеку anthropic — агенты не запустятся"
"$APP/venv/bin/pip" install -q --upgrade pypdf || echo "!! Не установилась библиотека pypdf — агент КП не прочитает PDF"
"$APP/venv/bin/pip" install -q --upgrade weasyprint || echo "!! Не установилась библиотека weasyprint — диагностика не соберёт PDF"
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

# Пользователи. Первое включение ролей: прежние логины становятся руководителями, чтобы никто не потерял доступ.
C=/etc/airl-1c-hub
if [ ! -f "$C/roles" ]; then
  cut -d: -f1 "$C/htpasswd" | sed 's/$/:admin/' > "$C/roles"
fi
# Файлами паролей теперь владеет служба хаба: так суперадмин может заводить людей прямо в хабе.
# Группа остаётся прежней (её читает nginx), меняется только владелец.
[ -f "$C/htpasswd-admin" ] || install -m 640 -o root -g "$(stat -c %G "$C/htpasswd")" /dev/null "$C/htpasswd-admin"
chown airl-hub "$C/htpasswd" "$C/htpasswd-admin" "$C/roles"
chmod 640 "$C/htpasswd" "$C/htpasswd-admin"; chmod 600 "$C/roles"
install -d -o airl-hub -g airl-hub -m 755 "$APP/web/private" /var/lib/airl-1c-hub/agents
airl-hub user rebuild || echo "!! Не удалось пересобрать список пользователей"

# Команда ИИ-агентов: ежедневная цепочка, почасовые напоминания и постоянно работающий чат
unit() {   # имя, описание, тип запуска, аргумент agents.py, дополнительный каталог на запись
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
ReadWritePaths=/var/lib/airl-1c-hub $APP/web ${5:-}
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
RestartSec=5
RuntimeDirectory=airl-hub
RuntimeDirectoryMode=0755" serve -/etc/airl-1c-hub
timer daily "*-*-* 08:00:00 Asia/Almaty"
timer tick "*-*-* *:05:00"
printf '\n[Install]\nWantedBy=multi-user.target\n' >> /etc/systemd/system/airl-hub-agents-api.service
install -d -o airl-hub -g airl-hub -m 755 "$APP/web/agents"
if [ "${SKIP_SYSTEMD:-0}" != 1 ]; then
  systemctl daemon-reload
  systemctl enable --now airl-hub-targetolog.timer airl-hub-agents-tick.timer >/dev/null
  if [ -f /etc/airl-1c-hub/agents-paused ]; then echo "Автозапуск агентов остаётся на паузе (включить: airl-hub agents resume)"
  else systemctl enable --now airl-hub-agents-daily.timer >/dev/null; fi
  systemctl enable airl-hub-agents-api.service >/dev/null 2>&1
  systemctl restart airl-hub-agents-api.service
  sleep 2
  systemctl is-active --quiet airl-hub-agents-api.service && echo "Чат агентов запущен" || { echo "!! Чат агентов не запустился:"; journalctl -u airl-hub-agents-api -n 8 --no-pager -o cat; }
fi
if [ -n "${BITRIX_WEBHOOK:-}" ]; then
  sed -i '/^BITRIX_WEBHOOK=/d' "$ENVF"
  echo "BITRIX_WEBHOOK=$BITRIX_WEBHOOK" >> "$ENVF"
  echo "Вебхук Bitrix24 сохранён"
fi
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
    proxy_pass http://unix:/run/airl-hub/agents.sock:/;
    proxy_set_header X-Hub-User $remote_user;
    proxy_set_header Authorization "";
    proxy_read_timeout 300s;
    client_max_body_size 16m;                # файл ТЗ для агента КП — до 10 МБ; размер сообщений чата ограничивает сама служба
    proxy_send_timeout 300s;
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
  grep -q "client_max_body_size 16m" /etc/nginx/snippets/airl-1c-hub.conf && echo "Агент КП: приём файлов до 10 МБ включён" || echo "!! Агент КП: настройка nginx не обновилась"
  systemctl is-active --quiet airl-hub-agents-api.service && echo "Служба агентов работает" || echo "!! Служба агентов не работает"
  runuser -u airl-hub -- test -w /etc/airl-1c-hub/htpasswd && echo "Пользователи: управление из хаба включено" || echo "!! Служба не может менять пароли: управление пользователями из хаба не заработает"
  # самопроверка новой версии: спрашиваем службу напрямую, как это делает nginx
  code=$(curl -s -o /dev/null -w '%{http_code}' --unix-socket /run/airl-hub/agents.sock -H 'X-Hub-User: self-check' http://localhost/diag || true)
  [ "$code" = 200 ] && echo "Диагностика: служба отвечает" || { echo "!! Диагностика не отвечает (код $code). Журнал службы:"; journalctl -u airl-hub-agents-api -n 12 --no-pager -o cat; }
  "$APP/venv/bin/python" -c "import weasyprint" 2>/dev/null && echo "Отчёты в PDF: готово" || echo "!! Отчёты в PDF: библиотека не установилась, диагностика не сможет собрать файл"
  echo "Готово: https://airl.kz/airl-hub/"
else
  journalctl -u airl-1c-hub-sync -n 15 --no-pager -o cat
  echo "!! Выгрузка завершилась с ошибкой (см. выше). Прежний скрипт сохранён в $APP/sync.py.bak"; exit 1
fi
