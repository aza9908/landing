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
python3 -m py_compile "$tmp/sync.py" "$tmp/targetolog.py"   # не ставим скрипт, который не запускается
bash -n "$tmp/airl-hub"
cp -a "$APP/sync.py" "$APP/sync.py.bak" 2>/dev/null || true
install -m 755 "$tmp/sync.py" "$APP/sync.py"
install -m 755 "$tmp/airl-hub" /usr/local/bin/airl-hub
install -m 755 "$tmp/targetolog.py" "$APP/targetolog.py"

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
systemctl daemon-reload
systemctl enable --now airl-hub-targetolog.timer >/dev/null
if [ -n "${BITRIX_WEBHOOK:-}" ]; then
  sed -i '/^BITRIX_WEBHOOK=/d' "$ENVF"
  echo "BITRIX_WEBHOOK=$BITRIX_WEBHOOK" >> "$ENVF"
  echo "Вебхук Bitrix24 сохранён"
fi
echo "Обновляю данные…"
if systemctl start airl-1c-hub-sync; then
  journalctl -u airl-1c-hub-sync -n 8 --no-pager -o cat | tail -6
  echo "Готово: https://airl.kz/airl-hub/"
else
  journalctl -u airl-1c-hub-sync -n 15 --no-pager -o cat
  cp -a "$APP/sync.py.bak" "$APP/sync.py"; echo "!! Выгрузка не прошла, возвращён прежний скрипт"; exit 1
fi
