#!/usr/bin/env bash
# Сертификат Let's Encrypt для airl.kz и поддоменов.
#
# Работает и ДО переключения DNS: прежний хостинг пересылает проверочные запросы
# (/.well-known/acme-challenge/…) на этот сервер (см. server.js, proxyAcme), так что
# сертификат можно выпустить заранее и переключить домен без ошибок HTTPS.
# В сертификат попадают только те имена, чья проверка реально доходит сюда;
# когда появится ещё одно (например online.airl.kz), запустите скрипт снова.
set -euo pipefail
WEBROOT=/var/www/certbot
CH="$WEBROOT/.well-known/acme-challenge"
mkdir -p "$CH"

# Доходит ли проверка для имени $1 до этого сервера: кладём случайный файл и
# читаем его снаружи. Так мы не тратим попытки Let's Encrypt на заведомый отказ.
reaches() {
  local t got
  t="selftest-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  echo "$t" > "$CH/$t"
  got=$(curl -sL --max-time 25 "http://$1/.well-known/acme-challenge/$t" || true)
  if [ "$got" != "$t" ]; then
    WHY=$(curl -sL --max-time 25 -o /dev/null -w 'HTTP %{http_code} at %{url_effective}' "http://$1/.well-known/acme-challenge/$t" 2>&1 || true)
  fi
  rm -f "$CH/$t"
  [ "$got" = "$t" ]
}

DOMAINS=""
for d in airl.kz www.airl.kz online.airl.kz; do
  dns=$( (getent ahostsv4 "$d" || true) | awk '{print $1}' | sort -u | tr '\n' ' ')
  WHY=""
  if [ -n "$dns" ] && reaches "$d"; then
    DOMAINS="$DOMAINS -d $d"; echo "ok   $d (→ $dns)"
  else
    echo "skip $d (→ ${dns:-no DNS record}): the check does not reach this server${WHY:+ — $WHY}"
  fi
done
case "$DOMAINS " in *"-d airl.kz "*) ;; *) echo "The check for airl.kz does not reach this server — nothing issued."; exit 1;; esac

command -v certbot >/dev/null || { apt-get update -qq && apt-get install -y -qq certbot >/dev/null; }
certbot certonly --webroot -w "$WEBROOT" $DOMAINS --non-interactive --agree-tos \
  --register-unsafely-without-email --keep-until-expiring --expand --cert-name airl.kz \
  --deploy-hook "systemctl reload nginx"
echo "renewal timer: $(systemctl is-active certbot.timer 2>/dev/null || echo 'not active')"

# setup.sh видит сертификат и включает HTTPS-блок.
bash /opt/airl-landing/deploy/vps/setup.sh
curl -sS -o /dev/null -w "https://airl.kz/ served by this server → HTTP %{http_code}, certificate verified\n" --resolve airl.kz:443:127.0.0.1 https://airl.kz/
